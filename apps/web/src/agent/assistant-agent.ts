import { createAITools } from "@cloudflare/computer/tools/ai-sdk";
import {
  type ChatErrorContext,
  type ChatResponseResult,
  defaultContextOverflowClassifier,
  type Session,
  type StepContext,
  skills,
  Think,
  type ThinkSubmissionInspection,
  type ToolCallResultContext,
  type TurnConfig,
  type TurnContext,
} from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { BUILTIN_SKILLS } from "@productivity/core/agent/builtin-skills";
import { RenderChartInputSchema } from "@productivity/core/agent/chart-spec";
import { conversationTurnFilesData } from "@productivity/core/agent/conversation-files";
import {
  type AssistantModelId,
  type AssistantReasoningEffort,
  DEFAULT_ASSISTANT_MODEL,
  getModelReasoningEfforts,
  resolveAssistantModelId,
  resolveAssistantReasoningEffort,
} from "@productivity/core/agent/models";
import { CONTEXT_SUMMARY_TOOL_NAME } from "@productivity/core/agent/tool-messages";
import { TransactionsSpecSchema } from "@productivity/core/agent/transactions-spec";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES } from "@productivity/core/agent/uploads";
import {
  type ConversationItem,
  MEMORY_INJECTION_LIMIT,
  SKILL_CATALOG_LIMIT,
} from "@productivity/core/user-db/migrations";
import { type AiMutationResult, type AiQueryResult, createDbTools, type DbToolsAccess } from "@sqlite-sync/ai";
import { createCompactFunction } from "agents/sessions";
import { generateText, type LanguageModel, type ToolSet, tool } from "ai";
import { getServerByName } from "partyserver";
import { PostHog } from "posthog-node";
import { z } from "zod";
import type { UserDbServer } from "../user-db/user-db-server";
import {
  conversationTitleFromTurnText,
  projectionRowsFromStep,
  projectionRowsFromUiMessages,
  userTurnModelText,
} from "./conversation-projection";
import { copyLegacyShellWorkspace } from "./legacy-workspace";
import { posthogTelemetry } from "./posthog-telemetry";
import { createWebTools } from "./web-tools";

const TURN_BUDGET_USD = 0.5;
const COMPACT_AFTER_TOKENS = 232_000;
const COMPACT_KEEP_RECENT_TOKENS = 20_000;
const TURN_BUDGET_MESSAGE = `Stopped after reaching the $${TURN_BUDGET_USD.toFixed(2)} model budget for this turn. Send another message to continue.`;

export type WorkspaceUploadInput = {
  filename: string;
  mediaType: string;
  bytes: ArrayBuffer;
};

type WorkspaceUploadResult = {
  filename: string;
  mediaType: string;
  size: number;
  path: string;
};

type WorkspaceDownloadResult = {
  filename: string;
  mediaType: string;
  size: number;
  path: string;
};

type WorkspaceDownloadFile = {
  filename: string;
  mediaType: string;
  bytes: ArrayBuffer;
};

export const DOWNLOAD_DIR = "/outputs";

const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  html: "text/html",
  xml: "application/xml",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
};

function guessMediaType(filename: string) {
  const ext = filename.split(".").at(-1)?.toLowerCase();
  return (ext && MEDIA_TYPE_BY_EXTENSION[ext]) || "application/octet-stream";
}

export function isDownloadPath(path: unknown): path is string {
  return (
    typeof path === "string" && path.startsWith(`${DOWNLOAD_DIR}/`) && !path.includes("..") && !path.includes("\0")
  );
}

function normalizeWorkspacePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function sanitizeWorkspaceFilename(filename: string) {
  const clean = filename
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!clean || clean === "." || clean === "..") {
    return "upload";
  }
  return clean;
}

function uploadLimitError(files: readonly WorkspaceUploadInput[]): string | null {
  if (files.length > MAX_UPLOAD_FILES) {
    return `Upload at most ${MAX_UPLOAD_FILES} files.`;
  }
  let totalBytes = 0;
  for (const file of files) totalBytes += file.bytes.byteLength;
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return "Combined upload is too large.";
  }
  return null;
}

type AssistantUsageState = {
  totalCostUsd: number;
  totalTokens: number;
  turnStartCostUsd?: number;
  fileCounter: number;
  nextSeq: number;
  // Absent on legacy DO state. Skip backfill only when this is exactly true —
  // never default it in initialState, which would mark old chats as done.
  projectionReady?: boolean;
  // Keep this write first in startConversation: draft cleanup relies on it, and on a destroyed
  // agent it throws before the user DB is touched. Absent on legacy state, so draft cleanup
  // also checks the user DB before destroying anything.
  started?: boolean;
  instructions?: string;
};

const DRAFT_AGENT_TTL_SECONDS = 6 * 60 * 60;

export type AssistantTurnError = { code: "NOT_FOUND" | "BAD_REQUEST"; message: string };

const noSkillResources = skills.manifest({ id: "user-skills", skills: [] });

function skillManifestEntry(skill: { name: string; title: string; whenToUse: string; instructions: string }) {
  const title = skill.title || "Untitled skill";
  const header = skill.whenToUse ? `When to use: ${skill.whenToUse}\n\n` : "";
  return {
    name: skill.name,
    description: skill.whenToUse ? `${title} — ${skill.whenToUse}` : title,
    body: `# ${title}\n\n${header}${skill.instructions}`,
  };
}

export class AssistantAgent extends Think<Env, AssistantUsageState> {
  maxSteps = 100;

  // Models whose window is below COMPACT_AFTER_TOKENS overflow before the between-turns
  // threshold; this compacts and retries the rejected turn instead of failing it.
  override contextOverflow = { reactive: true };
  override classifyChatError = defaultContextOverflowClassifier;

  initialState: AssistantUsageState = {
    totalCostUsd: 0,
    totalTokens: 0,
    fileCounter: 0,
    nextSeq: 0,
  };

  private turnNextSeq = 0;
  private userSkillIds = new Set<string>();
  private posthogClient?: PostHog;

  private reserveFileIndices(count: number): number {
    const current = this.state.fileCounter ?? 0;
    this.setState({ ...this.state, fileCounter: current + count });
    return current + 1;
  }

  private getPosthogClient(): PostHog {
    if (!this.posthogClient) {
      this.posthogClient = new PostHog(this.env.POSTHOG_API_KEY, {
        host: this.env.POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
      });
    }
    return this.posthogClient;
  }

  getModel(modelId: AssistantModelId = DEFAULT_ASSISTANT_MODEL, reasoningEffortOverride?: unknown): LanguageModel {
    const openrouter = createOpenRouter({
      apiKey: this.env.OPENROUTER_API_KEY,
    });
    const reasoningEffort = resolveAssistantReasoningEffort(modelId, reasoningEffortOverride);
    return openrouter.chat(modelId, {
      usage: { include: true },
      ...(reasoningEffort
        ? {
            // OpenRouter accepts GPT-5.6's `max`; the SDK typings lag behind.
            reasoning: { effort: reasoningEffort as "xhigh" | "high" | "medium" | "low" | "minimal" | "none" },
          }
        : {}),
    });
  }

  async beforeTurn(ctx: TurnContext): Promise<TurnConfig> {
    if (!ctx.continuation) this.setState({ ...this.state, turnStartCostUsd: this.state.totalCostUsd });
    const stub = await this.getUserDbStub();
    const conversation = await stub.getConversation(this.getConversationId());
    const modelId = resolveAssistantModelId(conversation?.model);
    const model = this.getModel(modelId, conversation?.reasoningEffort);
    const memories = await this.getMemoriesBlock();
    return {
      model,
      telemetry: {
        integrations: posthogTelemetry(this.getPosthogClient(), {
          distinctId: this.getUserId(),
          traceId: crypto.randomUUID(),
          sessionId: this.getConversationId(),
        }),
      },
      ...(memories ? { instructions: `${ctx.system}\n\n${memories}` } : {}),
      stopWhen: () => this.turnBudgetExhausted(),
    };
  }

  configureSession(session: Session) {
    const compact = createCompactFunction({
      summarize: (prompt) => this.summarizeHistory(prompt),
      keepRecentTokens: COMPACT_KEEP_RECENT_TOKENS,
    });
    return session
      .onCompaction(async (messages) => {
        const result = await compact(messages);
        if (result) await this.projectContextSummaryMarker();
        return result;
      })
      .compactAfter(COMPACT_AFTER_TOKENS);
  }

  private async summarizeHistory(prompt: string): Promise<string> {
    const stub = await this.getUserDbStub();
    const conversation = await stub.getConversation(this.getConversationId());
    const modelId = resolveAssistantModelId(conversation?.model);
    const result = await generateText({
      model: this.getModel(modelId, getModelReasoningEfforts(modelId)[0]),
      prompt,
    });
    const usage = (
      result.providerMetadata as { openrouter?: { usage?: { cost?: number; totalTokens?: number } } } | undefined
    )?.openrouter?.usage;
    this.setState({
      ...this.state,
      totalCostUsd: this.state.totalCostUsd + (usage?.cost ?? 0),
      totalTokens: this.state.totalTokens + (usage?.totalTokens ?? result.usage.totalTokens ?? 0),
    });
    return result.text;
  }

  private async projectContextSummaryMarker(): Promise<void> {
    try {
      const stub = await this.getUserDbStub();
      const seq = this.nextProjectionSeq();
      if (seq <= 0) return;
      this.turnNextSeq = seq + 1;
      this.setState({ ...this.state, nextSeq: this.turnNextSeq });
      await stub.upsertConversationMessages([
        {
          id: `context-summary:${crypto.randomUUID()}`,
          conversationId: this.getConversationId(),
          seq,
          role: "assistant",
          kind: "tool",
          text: "",
          toolName: CONTEXT_SUMMARY_TOOL_NAME,
          toolCallId: "",
          toolState: "done",
          data: "",
          createdAt: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Failed to project the context summary marker", error);
    }
  }

  configureContext() {
    return [
      {
        label: "instructions",
        description: "Base assistant instructions",
        provider: { get: async () => this.buildInstructions() },
      },
    ];
  }

  getSkills() {
    return [this.userSkillSource(), this.builtinSkillSource()];
  }

  // App-shipped skills defined in code (see builtin-skills.ts). Always active, never stored per-user.
  private builtinSkillSource() {
    return skills.manifest({
      id: "builtin-skills",
      skills: BUILTIN_SKILLS.map((skill) =>
        skillManifestEntry({
          name: skill.id,
          title: skill.name,
          whenToUse: skill.whenToUse,
          instructions: skill.instructions,
        }),
      ),
    });
  }

  // The user's active skills, read live from the synced `skill` table. Think lists every source
  // before each turn, so activating or editing a skill reaches the next turn.
  private userSkillSource(): skills.SkillSource {
    const id = "user-skills";
    return {
      id,
      list: async () => {
        const stub = await this.getUserDbStub();
        // Picks the most recently used skills, but lists them in a stable order so using a
        // skill doesn't change the prompt and trigger a context reminder.
        const rows = (await stub.getActiveSkills(SKILL_CATALOG_LIMIT)).sort((a, b) => a.id.localeCompare(b.id));
        this.userSkillIds = new Set(rows.map((row) => row.id));
        return skills
          .manifest({
            id,
            skills: rows.map((row) =>
              skillManifestEntry({
                name: row.id,
                title: row.name,
                whenToUse: row.whenToUse,
                instructions: row.instructions,
              }),
            ),
          })
          .list();
      },
      readResource: (skill, path) => noSkillResources.readResource(skill, path),
    };
  }

  async afterToolCall(ctx: ToolCallResultContext): Promise<void> {
    if (ctx.toolName !== "activate_skill" || !ctx.success) return;
    const name = (ctx.input as { name?: unknown } | undefined)?.name;
    if (typeof name !== "string" || !this.userSkillIds.has(name)) return;
    const stub = await this.getUserDbStub();
    await stub.mutate({
      events: [{ type: "item-updated", dataset: "_skill", item_id: name, payload: { lastUsedAt: Date.now() } }],
    });
  }

  private async getMemoriesBlock(): Promise<string | null> {
    const stub = await this.getUserDbStub();
    const result = (await stub.query({
      sql: "SELECT id, content FROM memory WHERE enabled = 1 ORDER BY createdAt DESC LIMIT ?",
      parameters: [MEMORY_INJECTION_LIMIT],
    })) as AiQueryResult;
    if ("error" in result || result.rows.length === 0) {
      return null;
    }
    const lines = result.rows.map((row) => `- [${String(row.id)}] ${String(row.content)}`);
    return [
      "What you remember about the user (persists across all chats). Revise with update_memory or forget, referencing the bracketed id:",
      ...lines,
    ].join("\n");
  }

  async onStepEnd(ctx: StepContext): Promise<void> {
    this.ctx.waitUntil(this.getPosthogClient().flush());
    const usage = (
      ctx.providerMetadata as { openrouter?: { usage?: { cost?: number; totalTokens?: number } } } | undefined
    )?.openrouter?.usage;
    const cost = usage?.cost ?? 0;
    const tokens = usage?.totalTokens ?? ctx.usage?.totalTokens ?? 0;
    const rows = this.stepProjectionRows(ctx);
    if (rows.length > 0) {
      const stub = await this.getUserDbStub();
      await stub.upsertConversationMessages(rows);
      this.turnNextSeq = rows[rows.length - 1].seq + 1;
    }
    this.setState({
      ...this.state,
      nextSeq: this.nextProjectionSeq(),
      totalCostUsd: this.state.totalCostUsd + cost,
      totalTokens: this.state.totalTokens + tokens,
    });
  }

  async onChatResponse(result: ChatResponseResult): Promise<void> {
    if (result.status === "completed") return this.syncConversationTurn(this.completedTurnStatus());
    const turnStatus = result.status === "error" ? "error" : "idle";
    const turnError = result.status === "error" ? (result.error ?? "Something went wrong.") : "";
    await this.syncConversationTurn({ turnStatus, turnError });
  }

  private turnBudgetExhausted() {
    const { totalCostUsd, turnStartCostUsd = totalCostUsd } = this.state;
    return totalCostUsd - turnStartCostUsd >= TURN_BUDGET_USD;
  }

  private completedTurnStatus() {
    const turnError = this.turnBudgetExhausted() ? TURN_BUDGET_MESSAGE : "";
    return { turnStatus: turnError ? "error" : "idle", turnError } as const;
  }

  protected override async onSubmissionStatus(submission: ThinkSubmissionInspection): Promise<void> {
    const status = submission.status;
    switch (status) {
      case "pending":
      case "running":
        return;
      case "error":
        await this.syncConversationTurn({
          turnStatus: "error",
          turnError: submission.error ?? "Something went wrong.",
        });
        return;
      case "completed":
        await this.syncConversationTurn(this.completedTurnStatus());
        return;
      case "aborted":
      case "skipped":
        await this.syncConversationTurn({ turnStatus: "idle", turnError: "" });
        return;
      default: {
        const exhaustiveStatus: never = status;
        return exhaustiveStatus;
      }
    }
  }

  onChatError(error: unknown, _ctx?: ChatErrorContext): unknown {
    const message = error instanceof Error ? error.message : String(error);
    this.ctx.waitUntil(this.syncConversationTurn({ turnStatus: "error", turnError: message }));
    return error;
  }

  // Think hydrates `this.messages` before this runs. Swallow errors so a UserDb
  // hiccup cannot brick isolate init (throwing from onStart retries forever).
  async onStart(): Promise<void> {
    try {
      await copyLegacyShellWorkspace(this.ctx.storage.sql, this.workspace.fs);
    } catch (error) {
      console.error("Failed to copy the legacy workspace", error);
    }
    try {
      await this.refreshInstructionsIfChanged();
    } catch (error) {
      console.error("Failed to refresh assistant instructions", error);
    }
    try {
      await this.ensureProjectionReady();
    } catch (error) {
      console.error("Failed to backfill conversation projection", error);
    }
  }

  // Think persists the system prompt a conversation started with; rebuild it when the
  // instructions change so existing chats stop describing tools that no longer exist.
  private async refreshInstructionsIfChanged(): Promise<void> {
    const instructions = this.buildInstructions();
    if (this.state.instructions === instructions) return;
    if (this.state.instructions !== undefined || (await this.getMessages()).length > 0) {
      await this.context.refreshSystemPrompt();
    }
    this.setState({ ...this.state, instructions });
  }

  async startConversation(input: {
    turnId: string;
    text: string;
    model: AssistantModelId;
    reasoningEffort: AssistantReasoningEffort | null;
    files?: WorkspaceUploadInput[];
  }): Promise<{ accepted: boolean; error?: undefined } | { accepted?: undefined; error: AssistantTurnError }> {
    this.setState({ ...this.state, started: true });

    const conversationId = this.getConversationId();
    const stub = await this.getUserDbStub();
    const conversation = await stub.createConversation({
      id: conversationId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });

    try {
      const result = await this.enqueueTurn(
        stub,
        conversation,
        { turnId: input.turnId, text: input.text, files: input.files ?? [] },
        true,
      );
      if (result.error) {
        await stub.updateConversation(conversationId, { turnStatus: "error", turnError: result.error.message });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await stub.updateConversation(conversationId, { turnStatus: "error", turnError: message });
      throw error;
    }
  }

  async submitTurn(input: {
    turnId: string;
    text: string;
    files?: WorkspaceUploadInput[];
  }): Promise<{ accepted: boolean; error?: undefined } | { accepted?: undefined; error: AssistantTurnError }> {
    const stub = await this.getUserDbStub();
    const conversation = await stub.getConversation(this.getConversationId());
    return this.enqueueTurn(stub, conversation, { ...input, files: input.files ?? [] }, false);
  }

  private async enqueueTurn(
    stub: DurableObjectStub<UserDbServer>,
    conversation: ConversationItem | null,
    input: { turnId: string; text: string; files: WorkspaceUploadInput[] },
    allowRunning: boolean,
  ): Promise<{ accepted: boolean; error?: undefined } | { accepted?: undefined; error: AssistantTurnError }> {
    const conversationId = this.getConversationId();
    if (!conversation) {
      return { error: { code: "NOT_FOUND", message: "Conversation not found." } };
    }
    if (await this.inspectSubmission(input.turnId)) {
      return { accepted: false };
    }
    if (conversation.turnStatus === "running" && !allowRunning) {
      return { error: { code: "BAD_REQUEST", message: "A turn is already running." } };
    }

    const fileError = uploadLimitError(input.files);
    if (fileError) {
      return { error: { code: "BAD_REQUEST", message: fileError } };
    }
    if (!input.text.trim() && input.files.length === 0) {
      return { error: { code: "BAD_REQUEST", message: "Message is empty." } };
    }

    await this.ensureProjectionReady();

    const uploaded = await this.writeTurnUploads(input.turnId, input.files);
    const prompt = input.text.trim();
    const storedText = prompt;
    const modelText = userTurnModelText(prompt, uploaded);

    const title = conversation.title.trim()
      ? ""
      : conversationTitleFromTurnText(
          storedText,
          uploaded.map((file) => file.filename),
        );

    // Persist the user row and turnStatus before submitMessages. That call commits the
    // submission and may drain it from a schedule(0) alarm that interleaves with these
    // cross-DO writes. Re-submitting the same turnId upserts the row.
    const { seq } = await stub.appendUserTurn({
      message: {
        id: input.turnId,
        conversationId,
        role: "user",
        kind: "text",
        text: storedText,
        toolName: "",
        toolCallId: "",
        toolState: "",
        data: conversationTurnFilesData(uploaded),
        createdAt: Date.now(),
      },
      title,
    });
    this.turnNextSeq = seq + 1;
    this.setState({ ...this.state, nextSeq: this.turnNextSeq });

    try {
      const submission = await this.submitMessages(
        [{ id: input.turnId, role: "user", parts: [{ type: "text", text: modelText }] }],
        { submissionId: input.turnId, idempotencyKey: input.turnId },
      );
      return { accepted: submission.accepted };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await stub.updateConversation(conversationId, { turnStatus: "error", turnError: message });
      throw error;
    }
  }

  async cancelTurn(): Promise<{ ok: true; error?: undefined } | { ok?: undefined; error: AssistantTurnError }> {
    const conversationId = this.getConversationId();
    const stub = await this.getUserDbStub();
    const conversation = await stub.getConversation(conversationId);
    if (!conversation) {
      return { error: { code: "NOT_FOUND", message: "Conversation not found." } };
    }

    const activeSubmissions = await this.listSubmissions({ status: ["pending", "running"] });
    this.cancelAllChats();
    await Promise.all(
      activeSubmissions.map((submission) => this.cancelSubmission(submission.submissionId, "Cancelled by user.")),
    );

    // onSubmissionStatus already clears a live cancel. Also reset a stuck `running` row
    // so Stop recovers when status didn't catch up. Leave recorded errors visible.
    if (conversation.turnStatus === "running") {
      await stub.updateConversation(conversationId, { turnStatus: "idle", turnError: "" });
    }
    return { ok: true };
  }

  async ensureProjection(): Promise<{ ok: true; error?: undefined } | { ok?: undefined; error: AssistantTurnError }> {
    try {
      await this.ensureProjectionReady();
      await this.scheduleDraftCleanup();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: { code: "BAD_REQUEST", message } };
    }
  }

  private async scheduleDraftCleanup(): Promise<void> {
    if (this.state.started) return;
    if ((await this.getMessages()).length > 0) {
      this.setState({ ...this.state, started: true });
      return;
    }
    await this.schedule(DRAFT_AGENT_TTL_SECONDS, "cleanupUnusedDraft", undefined, { idempotent: true });
  }

  async cleanupUnusedDraft(): Promise<void> {
    if (this.state.started) return;
    if ((await this.getMessages()).length > 0) return;

    const stub = await this.getUserDbStub();
    if (await stub.getConversation(this.getConversationId())) {
      this.setState({ ...this.state, started: true });
      return;
    }
    // startConversation may have run while the user DB call was in flight.
    if (this.state.started) return;

    await this.destroy();
  }

  private async ensureProjectionReady(): Promise<void> {
    if (this.state.projectionReady === true) return;

    const messages = await this.getMessages();
    if (messages.length === 0) {
      this.setState({ ...this.state, projectionReady: true });
      return;
    }

    const conversationId = this.getConversationId();
    const stub = await this.getUserDbStub();
    const rows = projectionRowsFromUiMessages({ conversationId, messages });
    if (rows.length > 0) {
      await stub.upsertConversationMessages(rows);
    }
    const lastSeq = rows[rows.length - 1]?.seq ?? 0;
    this.setState({
      ...this.state,
      projectionReady: true,
      ...(lastSeq > 0 ? { nextSeq: Math.max(this.nextProjectionSeq(), lastSeq + 1) } : {}),
    });
  }

  private async createMemory(content: string): Promise<{ id: string | null; content: string }> {
    const stub = await this.getUserDbStub();
    const now = Date.now();
    const result = (await stub.mutate({
      events: [
        {
          type: "item-created",
          dataset: "_memory",
          payload: {
            content,
            source: "assistant",
            enabled: true,
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
    })) as AiMutationResult;
    const id = "createdIds" in result ? (result.createdIds[0] ?? null) : null;
    return { id, content };
  }

  private async updateMemory(
    id: string,
    fields: { content?: string; enabled?: boolean },
  ): Promise<{ id: string; updated: true }> {
    const stub = await this.getUserDbStub();
    const payload: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.content !== undefined) {
      payload.content = fields.content;
    }
    if (fields.enabled !== undefined) {
      payload.enabled = fields.enabled;
    }
    await stub.mutate({
      events: [{ type: "item-updated", dataset: "_memory", item_id: id, payload }],
    });
    return { id, updated: true };
  }

  private async forgetMemory(id: string): Promise<{ id: string; forgotten: true }> {
    const stub = await this.getUserDbStub();
    await stub.mutate({
      events: [{ type: "item-deleted", dataset: "_memory", item_id: id }],
    });
    return { id, forgotten: true };
  }

  private async createSkill(input: {
    name: string;
    whenToUse: string;
    instructions: string;
  }): Promise<{ id: string | null; name: string; status: "pending" }> {
    const stub = await this.getUserDbStub();
    const now = Date.now();
    const result = (await stub.mutate({
      events: [
        {
          type: "item-created",
          dataset: "_skill",
          payload: {
            name: input.name,
            whenToUse: input.whenToUse,
            instructions: input.instructions,
            source: "assistant",
            status: "pending",
            lastUsedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
    })) as AiMutationResult;
    const id = "createdIds" in result ? (result.createdIds[0] ?? null) : null;
    return { id, name: input.name, status: "pending" };
  }

  private buildInstructions() {
    return [
      "You are the built-in assistant of a personal productivity app with notes, accounts, and transactions.",
      "Help the user think through their notes, finances, and plans.",
      "The user's data lives in a synced SQLite database. Use the getDbSchema tool to learn how it is structured before reasoning about the user's data.",
      "The user can attach specific rows to a message as `@<table>:<id>` reference tokens (e.g. `@item:abc123` for a note, `@account:abc123`, `@transaction_entry:abc123`). Treat each as an explicit reference to that row; query the matching table by id with queryDb to load it before reasoning about it.",
      "Use mutateDb for requested changes to notes, accounts, transactions, or other synced data. Query first when updating or deleting existing rows. For create events, omit ids; mutateDb generates them and returns createdIds.",
      "For multi-step analysis or coordinated changes, use the execute tool to write JavaScript that calls tools.getDbSchema(), tools.queryDb(), and tools.mutateDb().",
      "You also have a workspace filesystem for temporary files and multi-step scratch work: use the read, ls, find, grep, write, edit, and delete tools directly, or the same tools as tools.write() etc. inside execute.",
      "When the user wants a file to download (CSV, JSON, report, etc.), first write it to the workspace (with the write tool, or tools.write() inside execute), then call saveDownload with that file's path to make it downloadable from the chat.",
      "To visualize data, call the renderChart tool. Aggregate and group the data first (with queryDb or execute) and embed only the final summarized points in the spec — keep the number of points and series small. After rendering a chart, briefly describe what it shows in text; do not also paste the full underlying data as a table.",
      "To show the user individual transactions, call the renderTransactions tool instead of a markdown table. Prefer `ref` items that reference real transaction_entry rows by id (query them first); use `inline` items only for transactions that do not exist in the database. After rendering, keep any accompanying text brief; do not also repeat the same rows as a table.",
      "Use the web_search tool for current events, external facts, prices, or anything outside the user's own data — never for the user's notes/accounts/transactions, which live in the database. Search only when the answer genuinely depends on up-to-date or external information. When you rely on a search result, cite it inline as a markdown link; if the user asks for sources, list the relevant URLs.",
      "Use the web_extract tool to read the full content of specific URLs — for example to go deeper on a promising web_search result or a link the user provides.",
      "You keep durable memories about the user across all conversations. When the user states a lasting preference, rule, or fact worth recalling later (a budget, a recurring categorization rule, how they like answers formatted), call remember with a short note. Do not remember one-off or trivial details, data already in the database, or secrets. Avoid duplicates: if a similar memory already exists in your remembered context, revise it with update_memory instead of adding another. Use forget when the user no longer wants something remembered.",
      "Your available skills are reusable playbooks for recurring tasks, each with a name and when-to-use. When a request matches one, load it with activate_skill before acting, then follow its steps, adapting to the situation.",
      "When the user asks to save what you just did as a reusable skill, call create_skill with a name, a whenToUse trigger, and generalized step-by-step instructions (no hard-coded ids or one-off values). It is saved as pending for the user to review and activate.",
      "Be concise and direct. Use markdown when it improves readability.",
    ].join("\n");
  }

  getTools(): ToolSet {
    const dbTools = createDbTools({
      access: () => this.getUserDbStub(),
      mutations: true,
    });
    const codeTools = {
      ...createDbTools({
        access: () => this.getCodeDbAccess(),
        mutations: true,
      }),
      ...createAITools({ workspace: this.workspace }),
    };

    return {
      ...dbTools,
      ...createWebTools(this.env.TAVILY_API_KEY),
      remember: tool({
        description: [
          "Save a small, durable memory about the user that persists across all conversations.",
          "Use for lasting preferences, rules, or facts — not one-off details, data already in the database, or secrets.",
          "Keep it short and general. Check your remembered context first; revise an existing memory with update_memory instead of duplicating.",
        ].join("\n"),
        inputSchema: z.object({
          content: z.string().min(1).describe("The fact or preference to remember, in one short sentence."),
        }),
        execute: async ({ content }) => this.createMemory(content),
      }),
      update_memory: tool({
        description: [
          "Update an existing memory by id (the bracketed id shown in your remembered context).",
          "Change its content and/or toggle whether it is enabled.",
        ].join("\n"),
        inputSchema: z.object({
          id: z.string().min(1).describe("Id of the memory to update."),
          content: z.string().min(1).optional().describe("New content for the memory."),
          enabled: z.boolean().optional().describe("Set false to mute the memory without deleting it."),
        }),
        execute: async ({ id, content, enabled }) => this.updateMemory(id, { content, enabled }),
      }),
      forget: tool({
        description: "Delete a memory by id (the bracketed id shown in your remembered context).",
        inputSchema: z.object({
          id: z.string().min(1).describe("Id of the memory to forget."),
        }),
        execute: async ({ id }) => this.forgetMemory(id),
      }),
      create_skill: tool({
        description: [
          "Save a reusable skill (a step-by-step playbook) for a recurring multi-step task.",
          "Use when the user asks to save what you just did so future chats can repeat it.",
          "Generalize from the conversation: write clear ordered steps with no hard-coded ids or one-off values.",
          "The skill is saved as pending until the user reviews and activates it.",
        ].join("\n"),
        inputSchema: z.object({
          name: z.string().min(1).describe("Short title for the skill."),
          whenToUse: z
            .string()
            .min(1)
            .describe("One sentence on when this skill applies, used to match future requests."),
          instructions: z
            .string()
            .min(1)
            .describe("Ordered step-by-step instructions in markdown, written generically."),
        }),
        execute: async (input) => this.createSkill(input),
      }),
      execute: createExecuteTool({
        ctx: this.ctx,
        tools: codeTools,
        loader: this.env.LOADER,
        globalOutbound: null,
        description: [
          "Execute JavaScript for multi-step analysis of the user's synced SQLite database.",
          "Available typed functions:",
          "{{types}}",
          "The workspace file tools (tools.read, tools.ls, tools.find, tools.grep, tools.write, tools.edit, tools.delete) are also available for temporary files, intermediate artifacts, and coordinated multi-step work.",
          "Call tools.getDbSchema() before querying unfamiliar tables.",
          "Use tools.queryDb({ sql, parameters }) for read-only SELECT/WITH/VALUES SQL.",
          "Use tools.mutateDb({ events }) for writes. Query first when updating or deleting existing rows.",
          "Create events must omit ids: do not provide item_id or payload.id, because mutateDb generates ids and returns createdIds.",
          "Codemode query results are capped at 1000 rows and 4000 characters per cell.",
          "Always use ? placeholders with parameters for values.",
          "Prefer SQL aggregation, filtering, and LIMIT clauses over fetching broad raw datasets.",
          "Return a concise final object or string with only the data needed to answer the user.",
        ].join("\n"),
      }),
      saveDownload: tool({
        description: [
          "Make an existing workspace file downloadable by the user directly in the chat.",
          "First create the file — with the write tool, or tools.write() inside execute — then call this with the file's path.",
          "Do not paste file contents here; pass only the path. The file is copied into the downloads area and returned as a downloadable link.",
        ].join("\n"),
        inputSchema: z.object({
          path: z.string().min(1).describe("Workspace path of an existing file to publish, e.g. /report.csv"),
          filename: z
            .string()
            .optional()
            .describe("Download file name including extension. Defaults to the source file's name."),
        }),
        execute: async ({ path, filename }) => this.saveDownloadFile({ path, filename }),
      }),
      renderChart: tool({
        description: [
          "Render a chart inline in the chat to visualize data for the user.",
          "Embed the already-aggregated data directly in the spec; do not reference external data.",
          "Supports line, area, and bar charts (with an optional `stacked` flag), pie/donut charts, and sankey flow diagrams.",
          "Use sankey to show how amounts flow between categories (e.g. income sources into spending categories, or transfers between accounts); its links reference nodes by name and must form an acyclic flow.",
          "Keep the data compact: aggregate, group, and limit with queryDb/execute before calling this.",
        ].join("\n"),
        inputSchema: RenderChartInputSchema,
        execute: async ({ chart }) => ({
          rendered: true,
          type: chart.type,
          title: chart.title ?? null,
        }),
      }),
      renderTransactions: tool({
        description: [
          "Render a list of transactions inline in the chat, using the app's native transaction cards.",
          "Prefer `ref` items that reference real transaction_entry rows by id (query them first with queryDb): they stay clickable and always reflect the user's real data.",
          "Use `inline` items only for transactions that do not exist in the database (hypothetical, projected, or computed). Give a positive `amount`; the sign is derived from `type`.",
          "Prefer this over a markdown table whenever you are showing the user individual transactions.",
        ].join("\n"),
        inputSchema: TransactionsSpecSchema,
        execute: async (spec) => ({ rendered: true, count: spec.items.length }),
      }),
    };
  }

  private async getUserDbStub() {
    const separatorIndex = this.name.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Unexpected agent name without a user-db prefix: ${this.name}`);
    }
    const userDbName = this.name.slice(0, separatorIndex);
    return await getServerByName(this.env.UserDbServer, userDbName, {
      locationHint: "weur",
    });
  }

  private getUserId(): string {
    const separatorIndex = this.name.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Unexpected agent name without a user-db prefix: ${this.name}`);
    }
    return this.name.slice("user-".length, separatorIndex);
  }

  private getConversationId(): string {
    const separatorIndex = this.name.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Unexpected agent name without a conversation suffix: ${this.name}`);
    }
    return this.name.slice(separatorIndex + 1);
  }

  private async syncConversationTurn(input: {
    turnStatus: "idle" | "running" | "error";
    turnError: string;
  }): Promise<void> {
    const stub = await this.getUserDbStub();
    await stub.updateConversation(this.getConversationId(), {
      updatedAt: Date.now(),
      totalCost: this.state.totalCostUsd,
      totalTokens: this.state.totalTokens,
      turnStatus: input.turnStatus,
      turnError: input.turnError,
    });
  }

  // Live counter, or the last persisted one after a mid-turn restart. Non-integers
  // (missing/legacy state) must not flow into seq — a NaN row poisons later max(seq).
  private nextProjectionSeq(): number {
    const seq = this.turnNextSeq || this.state.nextSeq;
    return Number.isInteger(seq) && seq > 0 ? seq : 0;
  }

  private stepProjectionRows(ctx: StepContext) {
    const assistant = this.getStreamingAssistantMessage();
    if (!assistant) return [];
    const startSeq = this.nextProjectionSeq();
    if (startSeq <= 0) return [];
    return projectionRowsFromStep({
      conversationId: this.getConversationId(),
      sessionMessageId: assistant.id,
      stepNumber: ctx.stepNumber,
      startSeq,
      createdAt: Date.now(),
      content: ctx.content,
    });
  }

  private async getCodeDbAccess(): Promise<DbToolsAccess> {
    const stub = await this.getUserDbStub();
    return {
      getSchemaDoc: () => stub.getSchemaDoc(),
      query: (input) => stub.queryForCode(input),
      mutate: (input) => stub.mutate(input),
    };
  }

  private async writeTurnUploads(turnId: string, files: WorkspaceUploadInput[]): Promise<WorkspaceUploadResult[]> {
    if (files.length === 0) return [];

    const uploadDir = `/uploads/${sanitizeWorkspaceFilename(turnId)}`;
    await this.workspace.fs.mkdir(uploadDir, { recursive: true });

    const uploaded: WorkspaceUploadResult[] = [];
    let index = 0;
    for (const file of files) {
      const filename = `${String(index++).padStart(2, "0")}-${sanitizeWorkspaceFilename(file.filename)}`;
      const path = `${uploadDir}/${filename}`;
      const bytes = new Uint8Array(file.bytes);
      await this.workspace.fs.writeFile(path, bytes);
      uploaded.push({
        filename: file.filename,
        mediaType: file.mediaType,
        size: bytes.byteLength,
        path,
      });
    }

    return uploaded;
  }

  private async statFile(path: string) {
    try {
      const stat = await this.workspace.fs.stat(path);
      return stat.isFile ? stat : null;
    } catch {
      return null;
    }
  }

  private async readFileBytes(path: string): Promise<ArrayBuffer> {
    return await new Response(await this.workspace.fs.readFile(path)).arrayBuffer();
  }

  async saveDownloadFile(input: { path: string; filename?: string }): Promise<WorkspaceDownloadResult> {
    const sourcePath = normalizeWorkspacePath(input.path);
    if (sourcePath.includes("\0")) {
      throw new Error("Invalid file path.");
    }

    const stat = await this.statFile(sourcePath);
    if (!stat) {
      throw new Error(
        `No file found at ${input.path}. Create it first (e.g. with the write tool) before saving it for download.`,
      );
    }

    const filename = sanitizeWorkspaceFilename(input.filename || sourcePath.split("/").at(-1) || "download");
    await this.workspace.fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    const index = this.reserveFileIndices(1);
    const path = `${DOWNLOAD_DIR}/${String(index).padStart(2, "0")}-${filename}`;

    await this.workspace.fs.writeFile(path, new Uint8Array(await this.readFileBytes(sourcePath)));

    return { filename, mediaType: guessMediaType(filename), size: stat.size, path };
  }

  async readDownloadFile(path: string): Promise<WorkspaceDownloadFile | null> {
    if (!isDownloadPath(path) || !(await this.statFile(path))) {
      return null;
    }
    const filename = (path.split("/").at(-1) || "download").replace(/^\d+-/, "");
    return { filename, mediaType: guessMediaType(filename), bytes: await this.readFileBytes(path) };
  }
}
