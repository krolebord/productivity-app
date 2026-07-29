import {
  type AiDbAccess,
  type AiMutationInput,
  type AiMutationResult,
  type AiQueryInput,
  type AiQueryResult,
  createAiDbAccess,
} from "@sqlite-sync/ai";
import {
  createKyselyExecutor,
  durableObjectAdapter,
  type RemoteHandler,
  type ServerSyncDb,
  type TypedPersistedCrdtEvent,
} from "@sqlite-sync/cloudflare";
import { type JobRuntime, setupJobs } from "do-jobs";
import { type Connection, Server } from "partyserver";
import {
  type CalendarSyncStatusReport,
  deleteConnectionSyncStatus,
  readConnectionSyncStatus,
  toSyncStatusReport,
} from "@/lib/google-calendar/sync-status";
import { type CalendarCleanupInput, calendarCleanupJob } from "./jobs/calendar-cleanup";
import { type CalendarMetadataInput, calendarMetadataJob } from "./jobs/calendar-metadata";
import { type CalendarSyncInput, calendarSyncJob } from "./jobs/calendar-sync";
import { cleanupConversationAgentJob } from "./jobs/cleanup-conversation-agent";
import { fetchCurrencyRatesJob } from "./jobs/fetch-currency-rates";
import { jobs } from "./jobs/jobs";
import { type MonobankImportInput, monobankImportJob } from "./jobs/monobank-import";
import { type MonobankMetadataInput, monobankMetadataJob } from "./jobs/monobank-metadata";
import { syncDbSchema, type UserSyncDbSchema } from "./migrations";
import { userDbSchemaDocContext } from "./schema-doc";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const CODEMODE_QUERY_LIMITS = {
  maxRows: 1000,
  maxCellChars: 4000,
};

export class UserDbServer extends Server<Env> {
  static options = {
    hibernate: true,
  };

  // biome-ignore lint/style/noNonNullAssertion: initialize in onStart
  private remoteHandler: RemoteHandler = null!;
  // biome-ignore lint/style/noNonNullAssertion: initialize in onStart
  private jobRuntime: JobRuntime = null!;
  // biome-ignore lint/style/noNonNullAssertion: initialize in onStart
  private aiDbAccess: AiDbAccess = null!;
  // biome-ignore lint/style/noNonNullAssertion: initialize in onStart
  private codeAiDbAccess: AiDbAccess = null!;
  // biome-ignore lint/style/noNonNullAssertion: initialize in onStart
  private syncDb: ServerSyncDb<UserSyncDbSchema> = null!;

  async onStart() {
    const { syncDb, remoteHandler } = await durableObjectAdapter.createCrdtStorage({
      syncDbSchema,
      crdtEventsTable: "crdt_events",
      nodeId: this.ctx.id.toString(),
      storage: this.ctx.storage,
      broadcastPayload: (payload) => {
        this.broadcast(payload);
      },
    });

    this.remoteHandler = remoteHandler;
    this.syncDb = syncDb;

    this.aiDbAccess = createAiDbAccess({
      executor: createKyselyExecutor(this.ctx.storage),
      storage: syncDb,
      syncDbSchema,
      context: userDbSchemaDocContext,
    });

    this.codeAiDbAccess = createAiDbAccess({
      executor: createKyselyExecutor(this.ctx.storage),
      syncDbSchema,
      context: userDbSchemaDocContext,
      limits: CODEMODE_QUERY_LIMITS,
    });

    this.jobRuntime = await setupJobs({
      jobs,
      ctx: this.ctx,
      context: { ctx: this.ctx, env: this.env, syncDb },
    });

    await this.jobRuntime.scheduleInterval(fetchCurrencyRatesJob, {
      input: { baseCurrency: "USD" },
      dedupeKey: "currency-rates",
      everyMs: TWELVE_HOURS_MS,
    });

    // Cheap when nothing is connected: the job exits immediately if the user has no calendar
    // connection rows.
    await this.jobRuntime.scheduleInterval(calendarSyncJob, {
      input: { providerConnectionId: null },
      dedupeKey: "calendar-sync",
      everyMs: FIFTEEN_MINUTES_MS,
    });

    syncDb.addEventListener("event-applied", (event) => {
      this.onEventApplied(event.payload).catch((error) => {
        console.error("Error handling applied event", event.payload, error);
      });
    });
  }

  async onAlarm() {
    await this.jobRuntime.onAlarm();
  }

  getSchemaDoc(): string {
    return this.aiDbAccess.getSchemaDoc();
  }

  query(input: AiQueryInput): AiQueryResult {
    return this.aiDbAccess.query(input);
  }

  mutate(input: AiMutationInput): AiMutationResult {
    return (
      this.aiDbAccess.mutate?.(input) ?? {
        error: "Database mutations are not enabled.",
      }
    );
  }

  queryForCode(input: AiQueryInput): AiQueryResult {
    return this.codeAiDbAccess.query(input);
  }

  async enqueueMonobankMetadata(input: MonobankMetadataInput): Promise<void> {
    await this.jobRuntime.schedule(monobankMetadataJob, { input, at: Date.now() });
  }

  async enqueueMonobankImport(input: MonobankImportInput): Promise<void> {
    await this.jobRuntime.schedule(monobankImportJob, { input, at: Date.now() });
  }

  async enqueueCalendarMetadata(input: CalendarMetadataInput): Promise<void> {
    await this.jobRuntime.schedule(calendarMetadataJob, { input, at: Date.now() });
  }

  async enqueueCalendarSync(input: CalendarSyncInput): Promise<void> {
    await this.jobRuntime.schedule(calendarSyncJob, { input, at: Date.now() });
  }

  async enqueueCalendarCleanup(input: CalendarCleanupInput): Promise<void> {
    await this.jobRuntime.schedule(calendarCleanupJob, { input, at: Date.now() });
  }

  /**
   * Apply calendar enablement in the server replica before scheduling work that reads it.
   *
   * A browser write followed by a separate RPC has no cross-channel ordering guarantee, whereas a
   * server-authored event is applied synchronously by `enqueueEvent`.
   */
  async setCalendarSourceEnabled(input: {
    sourceId: string;
    providerConnectionId: string;
    providerCalendarId: string;
    enabled: boolean;
  }): Promise<boolean> {
    const [source] = this.syncDb.executeKysely((q) =>
      q
        .selectFrom("calendar_source")
        .select(["id"])
        .where("id", "=", input.sourceId)
        .where("providerConnectionId", "=", input.providerConnectionId)
        .where("providerCalendarId", "=", input.providerCalendarId),
    ).rows;
    if (!source) return false;

    this.syncDb.enqueueEvent(
      this.syncDb.createEvent({
        type: "item-updated",
        dataset: "_calendar_source",
        item_id: source.id,
        payload: { enabled: input.enabled, updatedAt: Date.now() },
      }),
    );

    if (input.enabled) {
      await this.enqueueCalendarSync({ providerConnectionId: input.providerConnectionId });
    } else {
      await this.enqueueCalendarCleanup({
        providerConnectionId: input.providerConnectionId,
        providerCalendarId: input.providerCalendarId,
      });
    }
    return true;
  }

  /**
   * Per-run calendar sync diagnostics ("synced 3 minutes ago", per-calendar errors).
   *
   * These live in DO storage rather than the synced database — see
   * `src/lib/google-calendar/sync-status.ts` — so the integrations page fetches them on demand
   * instead of receiving a replicated write after every 15-minute run.
   */
  async getCalendarSyncStatus(providerConnectionIds: string[]): Promise<CalendarSyncStatusReport[]> {
    const reports: CalendarSyncStatusReport[] = [];
    for (const providerConnectionId of providerConnectionIds) {
      const status = await readConnectionSyncStatus(this.ctx.storage, providerConnectionId);
      reports.push(toSyncStatusReport(providerConnectionId, status));
    }
    return reports;
  }

  async clearCalendarSyncStatus(providerConnectionId: string): Promise<void> {
    await deleteConnectionSyncStatus(this.ctx.storage, providerConnectionId);
  }

  async getMonobankLinkedAccountIds(providerConnectionId: string): Promise<string[]> {
    return this.syncDb
      .executeKysely((q) =>
        q
          .selectFrom("monobank_account")
          .select(["providerAccountId"])
          .where("providerConnectionId", "=", providerConnectionId)
          .where("linkedAccountId", "!=", ""),
      )
      .rows.map((row) => row.providerAccountId);
  }

  private async onEventApplied(event: TypedPersistedCrdtEvent<typeof syncDbSchema>) {
    if (event.type === "item-deleted" && event.dataset === "_conversation") {
      // Conversation agents are named `${userDbName}:${conversationId}` — wipe the orphaned DO.
      await this.jobRuntime.schedule(cleanupConversationAgentJob, {
        input: { agentName: `${this.name}:${event.item_id}` },
        at: Date.now(),
      });
    }
  }

  onMessage(connection: Connection, message: string) {
    const messageResult = this.remoteHandler.handleMessage(message);

    if (!messageResult.success) {
      console.log("Invalid message", messageResult.error);
      return;
    }

    connection.send(messageResult.payload);
  }
}
