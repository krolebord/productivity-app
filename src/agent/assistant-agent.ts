import { createWorkspaceStateBackend, type WorkspaceFsLike } from "@cloudflare/shell";
import {
  type ChatResponseResult,
  type Session,
  type SkillSource,
  type StepContext,
  Think,
  type TurnConfig,
  type TurnContext,
} from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type AiMutationResult, type AiQueryResult, createDbTools, type DbToolsAccess } from "@sqlite-sync/ai";
import { tavilyExtract, tavilySearch } from "@tavily/ai-sdk";
import { type LanguageModel, type ToolSet, tool } from "ai";
import { getServerByName } from "partyserver";
import { z } from "zod";
import { MEMORY_INJECTION_LIMIT, SKILL_CATALOG_LIMIT } from "../user-db/migrations";
import { ChartSpecSchema } from "./chart-spec";
import { type AssistantModelId, DEFAULT_ASSISTANT_MODEL, resolveAssistantModelId } from "./models";

type WorkspaceUploadInput = {
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

type AssistantUsageState = {
  totalCostUsd: number;
  totalTokens: number;
  fileCounter: number;
};

type SkillCatalogRow = {
  id: string;
  name: string;
  whenToUse: string;
  updatedAt: number;
};

export class AssistantAgent extends Think<Env, AssistantUsageState> {
  maxSteps = 20;

  initialState: AssistantUsageState = {
    totalCostUsd: 0,
    totalTokens: 0,
    fileCounter: 0,
  };

  private reserveFileIndices(count: number): number {
    const current = this.state.fileCounter ?? 0;
    this.setState({ ...this.state, fileCounter: current + count });
    return current + 1;
  }

  getModel(modelId: AssistantModelId = DEFAULT_ASSISTANT_MODEL): LanguageModel {
    const openrouter = createOpenRouter({
      apiKey: this.env.OPENROUTER_API_KEY,
    });
    return openrouter.chat(modelId, { usage: { include: true } });
  }

  async beforeTurn(ctx: TurnContext): Promise<TurnConfig> {
    const model = this.getModel(resolveAssistantModelId(ctx.body?.model));
    const memories = await this.getMemoriesBlock();
    return memories ? { model, system: `${ctx.system}\n\n${memories}` } : { model };
  }

  configureSession(session: Session): Session {
    return session
      .withContext("instructions", {
        description: "Base assistant instructions",
        provider: { get: async () => this.buildInstructions() },
      })
      .withCachedPrompt();
  }

  getSkills(): SkillSource[] {
    return [this.skillSource()];
  }

  // The user's active skills, read live from the synced `skill` table. Think renders list()
  // into the system-prompt catalog and exposes the body via load_context; fingerprint drives
  // the framework's per-turn refresh when the active set changes.
  private skillSource(): SkillSource {
    const fetchActive = async (): Promise<SkillCatalogRow[]> => {
      const stub = await this.getUserDbStub();
      const result = (await stub.query({
        sql: "SELECT id, name, whenToUse, updatedAt FROM skill WHERE status = 'active' ORDER BY lastUsedAt DESC, createdAt DESC LIMIT ?",
        parameters: [SKILL_CATALOG_LIMIT],
      })) as AiQueryResult;
      return "error" in result ? [] : (result.rows as SkillCatalogRow[]);
    };
    const loadStub = () => this.getUserDbStub();
    const describe = (row: { name: string; whenToUse: string }) =>
      row.whenToUse ? `${row.name} — ${row.whenToUse}` : row.name || "Untitled skill";

    let cache: SkillCatalogRow[] = [];
    let fingerprint = "";

    return {
      id: "user-skills",
      get fingerprint() {
        return fingerprint;
      },
      async refresh() {
        cache = await fetchActive();
        fingerprint = cache.map((row) => `${row.id}:${row.updatedAt}`).join(",");
      },
      async list() {
        const rows = cache.length > 0 ? cache : await fetchActive();
        return rows.map((row) => ({
          name: row.id,
          description: describe(row),
        }));
      },
      async load(name) {
        const stub = await loadStub();
        const result = (await stub.query({
          sql: "SELECT id, name, whenToUse, instructions FROM skill WHERE id = ? AND status = 'active' LIMIT 1",
          parameters: [name],
        })) as AiQueryResult;
        if ("error" in result || result.rows.length === 0) {
          return null;
        }
        const row = result.rows[0] as {
          id: string;
          name: string;
          whenToUse: string;
          instructions: string;
        };
        await stub.mutate({
          events: [
            {
              type: "item-updated",
              dataset: "_skill",
              item_id: row.id,
              payload: { lastUsedAt: Date.now() },
            },
          ],
        });
        const header = row.whenToUse ? `When to use: ${row.whenToUse}\n\n` : "";
        return {
          name: row.id,
          description: describe(row),
          body: `# ${row.name}\n\n${header}${row.instructions}`,
        };
      },
    };
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

  onStepFinish(ctx: StepContext): void {
    const usage = (
      ctx.providerMetadata as { openrouter?: { usage?: { cost?: number; totalTokens?: number } } } | undefined
    )?.openrouter?.usage;
    const cost = usage?.cost ?? 0;
    const tokens = usage?.totalTokens ?? ctx.usage?.totalTokens ?? 0;
    if (cost === 0 && tokens === 0) {
      return;
    }
    this.setState({
      ...this.state,
      totalCostUsd: this.state.totalCostUsd + cost,
      totalTokens: this.state.totalTokens + tokens,
    });
  }

  async onChatResponse(_result: ChatResponseResult): Promise<void> {
    await this.syncUsageToConversation();
  }

  private async syncUsageToConversation(): Promise<void> {
    const stub = await this.getUserDbStub();
    await stub.mutate({
      events: [
        {
          type: "item-updated",
          dataset: "_conversation",
          item_id: this.getConversationId(),
          payload: {
            updatedAt: Date.now(),
            totalCost: this.state.totalCostUsd,
            totalTokens: this.state.totalTokens,
          },
        },
      ],
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
      "Inside execute, state.* is also available for temporary workspace files and multi-step scratch work.",
      "When the user wants a file to download (CSV, JSON, report, etc.), first write it with the execute tool's state.* API, then call saveDownload with that file's path to make it downloadable from the chat.",
      "To visualize data, call the renderChart tool. Aggregate and group the data first (with queryDb or execute) and embed only the final summarized points in the spec — keep the number of points and series small. Never sum or compare amounts across different currencies: group by currency or convert via the currency_rate table before charting. After rendering a chart, briefly describe what it shows in text; do not also paste the full underlying data as a table.",
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
    const codeDbTools = createDbTools({
      access: () => this.getCodeDbAccess(),
      mutations: true,
    });

    return {
      ...dbTools,
      web_search: tavilySearch({
        apiKey: this.env.TAVILY_API_KEY,
        searchDepth: "basic",
        includeAnswer: true,
        maxResults: 5,
      }),
      web_extract: tavilyExtract({
        apiKey: this.env.TAVILY_API_KEY,
        extractDepth: "basic",
      }),
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
        tools: codeDbTools,
        state: createWorkspaceStateBackend(this.workspace as WorkspaceFsLike),
        loader: this.env.LOADER,
        globalOutbound: null,
        description: [
          "Execute JavaScript for multi-step analysis of the user's synced SQLite database.",
          "Available typed functions:",
          "{{types}}",
          "The state.* workspace API is also available for temporary files, intermediate artifacts, and coordinated multi-step work.",
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
          "First create the file — for example with the execute tool's state.* API — then call this with the file's path.",
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
        inputSchema: ChartSpecSchema,
        execute: async (spec) => ({
          rendered: true,
          type: spec.type,
          title: spec.title ?? null,
        }),
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

  private getConversationId(): string {
    const separatorIndex = this.name.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Unexpected agent name without a conversation suffix: ${this.name}`);
    }
    return this.name.slice(separatorIndex + 1);
  }

  private async getCodeDbAccess(): Promise<DbToolsAccess> {
    const stub = await this.getUserDbStub();
    return {
      getSchemaDoc: () => stub.getSchemaDoc(),
      query: (input) => stub.queryForCode(input),
      mutate: (input) => stub.mutate(input),
    };
  }

  async uploadWorkspaceFiles(files: WorkspaceUploadInput[]): Promise<WorkspaceUploadResult[]> {
    const workspace = this.workspace as WorkspaceFsLike;
    const uploadDir = "/uploads";
    await workspace.mkdir(uploadDir, { recursive: true });
    let index = this.reserveFileIndices(files.length);

    const uploaded: WorkspaceUploadResult[] = [];
    for (const file of files) {
      const filename = `${String(index++).padStart(2, "0")}-${sanitizeWorkspaceFilename(file.filename)}`;
      const path = `${uploadDir}/${filename}`;
      const bytes = new Uint8Array(file.bytes);
      await workspace.writeFileBytes(path, bytes, file.mediaType);
      uploaded.push({
        filename: file.filename,
        mediaType: file.mediaType,
        size: bytes.byteLength,
        path,
      });
    }

    return uploaded;
  }

  async saveDownloadFile(input: { path: string; filename?: string }): Promise<WorkspaceDownloadResult> {
    const workspace = this.workspace as WorkspaceFsLike;
    const sourcePath = normalizeWorkspacePath(input.path);
    if (sourcePath.includes("\0")) {
      throw new Error("Invalid file path.");
    }

    const stat = await workspace.stat(sourcePath);
    if (!stat || stat.type !== "file") {
      throw new Error(
        `No file found at ${input.path}. Create it first (e.g. with the execute tool's state.* API) before saving it for download.`,
      );
    }

    const filename = sanitizeWorkspaceFilename(input.filename || sourcePath.split("/").at(-1) || "download");
    const mediaType = stat.mimeType || guessMediaType(filename);
    await workspace.mkdir(DOWNLOAD_DIR, { recursive: true });
    const index = this.reserveFileIndices(1);
    const path = `${DOWNLOAD_DIR}/${String(index).padStart(2, "0")}-${filename}`;

    await workspace.cp(sourcePath, path);

    return { filename, mediaType, size: stat.size, path };
  }

  async readDownloadFile(path: string): Promise<WorkspaceDownloadFile | null> {
    if (!isDownloadPath(path)) {
      return null;
    }
    const workspace = this.workspace as WorkspaceFsLike;
    const bytes = await workspace.readFileBytes(path);
    if (!bytes) {
      return null;
    }
    const stat = await workspace.stat(path);
    const filename = (path.split("/").at(-1) || "download").replace(/^\d+-/, "");
    const mediaType = stat?.mimeType || guessMediaType(filename);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { filename, mediaType, bytes: buffer };
  }
}
