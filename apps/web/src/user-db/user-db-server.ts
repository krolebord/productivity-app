import { DASHBOARD_SETTINGS_DEFAULTS, DASHBOARD_SETTINGS_ID } from "@productivity/core/dashboard-settings-defaults";
import { type ConversationItem, syncDbSchema, type UserSyncDbSchema } from "@productivity/core/user-db/migrations";
import {
  type AiDbAccess,
  type AiMutationInput,
  type AiMutationResult,
  type AiQueryInput,
  type AiQueryResult,
  createAiDbAccess,
} from "@sqlite-sync/ai";
import {
  durableObjectAdapter,
  type RemoteHandler,
  type ServerSyncDb,
  type TypedPersistedCrdtEvent,
} from "@sqlite-sync/cloudflare";
import { type JobRuntime, setupJobs } from "do-jobs";
import { type Connection, Server } from "partyserver";
import type { ConversationMessageSnapshot } from "@/agent/conversation-projection";
import type { BaseCurrencyCode } from "@/lib/currency/current-rates";
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
import { fetchAndPersistCurrencyRates, fetchCurrencyRatesJob } from "./jobs/fetch-currency-rates";
import { jobs } from "./jobs/jobs";
import { type MonobankImportInput, monobankImportJob } from "./jobs/monobank-import";
import { type MonobankMetadataInput, monobankMetadataJob } from "./jobs/monobank-metadata";
import {
  ACCOUNT_BALANCE_RECONCILIATION_DEDUPE_KEY,
  ACCOUNT_BALANCE_RECONCILIATION_DELAY_MS,
  ACCOUNT_BALANCE_RECONCILIATION_MAX_DELAY_MS,
  reconcileAccountBalancesJob,
} from "./jobs/reconcile-account-balances";
import { userDbSchemaDocContext } from "./schema-doc";
import {
  type CreateTaskInput,
  createTask,
  type GetAgendaInput,
  getAgenda,
  runTaskOperation,
  type UpdateTaskInput,
  updateTask,
} from "./task-operations";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const CALENDAR_SYNC_DEDUPE_KEY = "calendar-sync";
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
  private accountBalanceReconciliationQueued = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    durableObjectAdapter.enableHeartbeatAutoResponse(ctx);
  }

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
      executor: syncDb.unsafe,
      storage: syncDb,
      syncDbSchema,
      context: userDbSchemaDocContext,
    });

    this.codeAiDbAccess = createAiDbAccess({
      executor: syncDb.unsafe,
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

    // Only users with a calendar get the interval: `enqueueCalendarSync` registers it on connect,
    // and a later start drops it once no connection remains.
    const [calendarConnection] = syncDb.executeKysely((q) =>
      q.selectFrom("calendar_connection").select(["id"]).where("status", "!=", "disconnected").limit(1),
    ).rows;
    if (calendarConnection) {
      await this.scheduleCalendarSyncInterval();
    } else {
      await this.jobRuntime.cancelInterval(calendarSyncJob, { dedupeKey: CALENDAR_SYNC_DEDUPE_KEY });
    }

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

  initTimeZone(timeZone: string): { timeZone: string } {
    const [row] = this.syncDb.executeKysely((q) =>
      q.selectFrom("dashboard_settings").select("timeZone").where("id", "=", DASHBOARD_SETTINGS_ID),
    ).rows;
    if (row?.timeZone) return { timeZone: row.timeZone };

    const now = Date.now();
    if (row) {
      this.syncDb.applyEvent({
        type: "item-updated",
        dataset: "_dashboard_settings",
        item_id: DASHBOARD_SETTINGS_ID,
        payload: { timeZone, updatedAt: now },
      });
    } else {
      this.syncDb.applyEvent({
        type: "item-created",
        dataset: "_dashboard_settings",
        item_id: DASHBOARD_SETTINGS_ID,
        payload: {
          id: DASHBOARD_SETTINGS_ID,
          ...DASHBOARD_SETTINGS_DEFAULTS,
          timeZone,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    return { timeZone };
  }

  getAgenda(input: GetAgendaInput) {
    return runTaskOperation(() => getAgenda(this.syncDb, input));
  }

  createTask(input: CreateTaskInput) {
    return runTaskOperation(() => createTask(this.syncDb, input));
  }

  updateTask(input: UpdateTaskInput) {
    return runTaskOperation(() => updateTask(this.syncDb, input));
  }

  /** Manual refresh: same write path as the interval job, awaited so the client can toast the date. */
  async refreshCurrencyRates(input: {
    baseCurrency: BaseCurrencyCode;
  }): Promise<{ date: string; base: BaseCurrencyCode }> {
    return fetchAndPersistCurrencyRates(this.syncDb, input.baseCurrency);
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
    await this.scheduleCalendarSyncInterval();
  }

  private async scheduleCalendarSyncInterval(): Promise<void> {
    await this.jobRuntime.scheduleInterval(calendarSyncJob, {
      input: { providerConnectionId: null },
      dedupeKey: CALENDAR_SYNC_DEDUPE_KEY,
      everyMs: FIFTEEN_MINUTES_MS,
    });
  }

  async enqueueCalendarCleanup(input: CalendarCleanupInput): Promise<void> {
    await this.jobRuntime.schedule(calendarCleanupJob, { input, at: Date.now() });
  }

  /**
   * Apply calendar enablement in the server replica before scheduling work that reads it.
   *
   * A browser write followed by a separate RPC has no cross-channel ordering guarantee, whereas a
   * server-authored event is applied synchronously by `applyEvent`.
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

    this.syncDb.applyEvent({
      type: "item-updated",
      dataset: "_calendar_source",
      item_id: source.id,
      payload: { enabled: input.enabled, updatedAt: Date.now() },
    });

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

  async getConversation(id: string): Promise<ConversationItem | null> {
    const [row] = this.syncDb.executeKysely((q) => q.selectFrom("conversation").selectAll().where("id", "=", id)).rows;
    return row ?? null;
  }

  /** Creates the conversation if missing and returns its row. */
  async createConversation(input: {
    id: string;
    model: string;
    reasoningEffort: string | null;
  }): Promise<ConversationItem> {
    const existing = await this.getConversation(input.id);
    if (existing) return existing;

    const now = Date.now();
    const conversation: ConversationItem = {
      id: input.id,
      title: "",
      pinned: false,
      createdAt: now,
      updatedAt: now,
      lastReadAt: 0,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      totalCost: 0,
      totalTokens: 0,
      turnStatus: "running",
      turnError: "",
    };
    this.syncDb.applyEvent({
      type: "item-created",
      dataset: "_conversation",
      item_id: input.id,
      payload: conversation,
    });
    return conversation;
  }

  /** Appends the user message at the next seq and marks the turn running. An empty title leaves it unchanged. */
  async appendUserTurn(input: {
    message: Omit<ConversationMessageSnapshot, "seq">;
    title: string;
  }): Promise<{ seq: number }> {
    const { conversationId } = input.message;
    const seq = this.getMaxConversationMessageSeq(conversationId) + 1;
    await this.upsertConversationMessages([{ ...input.message, seq }]);
    await this.updateConversation(conversationId, {
      turnStatus: "running",
      turnError: "",
      ...(input.title ? { title: input.title } : {}),
    });
    return { seq };
  }

  // Raw base table, not the CRDT view: tombstones keep their seq, so a deleted message
  // cannot hand its number to a new one.
  private getMaxConversationMessageSeq(conversationId: string): number {
    const [row] = this.syncDb.unsafe.executeKysely((q) =>
      q
        .selectFrom("_conversation_message")
        .select((eb) => eb.fn.max<number | null>("seq").as("maxSeq"))
        .where("conversationId", "=", conversationId),
    ).rows;
    return row?.maxSeq ?? 0;
  }

  async upsertConversationMessages(messages: ConversationMessageSnapshot[]): Promise<void> {
    for (const message of messages) {
      const { id, ...patch } = message;
      this.syncDb.applySnapshot({
        dataset: "_conversation_message",
        id,
        patch,
      });
    }
  }

  async updateConversation(
    id: string,
    payload: Partial<Omit<ConversationItem, "id" | "tombstone" | "lastReadAt">> & { updatedAt?: number },
  ): Promise<void> {
    this.syncDb.applyEvent({
      type: "item-updated",
      dataset: "_conversation",
      item_id: id,
      payload: { updatedAt: Date.now(), ...payload },
    });
  }

  // Synced schema has no FKs; delete through the CRDT view so each row emits item-deleted.
  private deleteConversationMessages(conversationId: string): void {
    this.syncDb.executeKysely((q) => q.deleteFrom("conversation_message").where("conversationId", "=", conversationId));
  }

  /** Coalesce synchronously applied transaction events before updating the durable debounce. */
  private queueAccountBalanceReconciliation(): void {
    if (this.accountBalanceReconciliationQueued) {
      return;
    }

    this.accountBalanceReconciliationQueued = true;
    this.ctx.waitUntil(
      Promise.resolve()
        .then(() => {
          this.accountBalanceReconciliationQueued = false;
          return this.jobRuntime.scheduleDebounced(reconcileAccountBalancesJob, {
            input: {},
            dedupeKey: ACCOUNT_BALANCE_RECONCILIATION_DEDUPE_KEY,
            delayMs: ACCOUNT_BALANCE_RECONCILIATION_DELAY_MS,
            maxDelayMs: ACCOUNT_BALANCE_RECONCILIATION_MAX_DELAY_MS,
          });
        })
        .catch((error) => {
          console.error("Could not schedule account-balance reconciliation", error);
        }),
    );
  }

  private async onEventApplied(event: TypedPersistedCrdtEvent<typeof syncDbSchema>) {
    if (event.dataset === "_transaction_entry") {
      this.queueAccountBalanceReconciliation();
    }

    if (event.type === "item-deleted" && event.dataset === "_conversation") {
      this.deleteConversationMessages(event.item_id);
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
