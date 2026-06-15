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
  type TypedPersistedCrdtEvent,
} from "@sqlite-sync/cloudflare";
import { type JobRuntime, setupJobs } from "do-jobs";
import { type Connection, Server } from "partyserver";
import { cleanupConversationAgentJob } from "./jobs/cleanup-conversation-agent";
import { fetchCurrencyRatesJob } from "./jobs/fetch-currency-rates";
import { jobs } from "./jobs/jobs";
import { syncDbSchema } from "./migrations";
import { userDbSchemaDocContext } from "./schema-doc";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
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
