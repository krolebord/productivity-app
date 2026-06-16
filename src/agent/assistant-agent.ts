import { createWorkspaceStateBackend, type WorkspaceFsLike } from "@cloudflare/shell";
import { type ChatResponseResult, type StepContext, Think, type TurnConfig, type TurnContext } from "@cloudflare/think";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createDbTools, type DbToolsAccess } from "@sqlite-sync/ai";
import { type LanguageModel, type ToolSet, tool } from "ai";
import { getServerByName } from "partyserver";
import { z } from "zod";
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

// Directory the agent writes user-downloadable artifacts to. Only files under
// this prefix may be served by the download endpoint.
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
};

export class AssistantAgent extends Think<Env, AssistantUsageState> {
  initialState: AssistantUsageState = { totalCostUsd: 0, totalTokens: 0 };

  getModel(modelId: AssistantModelId = DEFAULT_ASSISTANT_MODEL): LanguageModel {
    const openrouter = createOpenRouter({
      apiKey: this.env.OPENROUTER_API_KEY,
    });
    return openrouter.chat(modelId, { usage: { include: true } });
  }

  beforeTurn(ctx: TurnContext): TurnConfig {
    return { model: this.getModel(resolveAssistantModelId(ctx.body?.model)) };
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

  getSystemPrompt() {
    return [
      "You are the built-in assistant of a personal productivity app with notes, accounts, and transactions.",
      "Help the user think through their notes, finances, and plans.",
      "The user's data lives in a synced SQLite database. Use the getDbSchema tool to learn how it is structured before reasoning about the user's data.",
      "Use mutateDb for requested changes to notes, accounts, transactions, or other synced data. Query first when updating or deleting existing rows. For create events, omit ids; mutateDb generates them and returns createdIds.",
      "For multi-step analysis or coordinated changes, use the execute tool to write JavaScript that calls codemode.getDbSchema(), codemode.queryDb(), and codemode.mutateDb().",
      "Inside execute, state.* is also available for temporary workspace files and multi-step scratch work.",
      "When the user wants a file to download (CSV, JSON, report, etc.), first write it with the execute tool's state.* API, then call saveDownload with that file's path to make it downloadable from the chat.",
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
      execute: createExecuteTool({
        tools: codeDbTools,
        state: createWorkspaceStateBackend(this.workspace as WorkspaceFsLike),
        loader: this.env.LOADER,
        globalOutbound: null,
        description: [
          "Execute JavaScript for multi-step analysis of the user's synced SQLite database.",
          "Available typed functions:",
          "{{types}}",
          "The state.* workspace API is also available for temporary files, intermediate artifacts, and coordinated multi-step work.",
          "Call codemode.getDbSchema() before querying unfamiliar tables.",
          "Use codemode.queryDb({ sql, parameters }) for read-only SELECT/WITH/VALUES SQL.",
          "Use codemode.mutateDb({ events }) for writes. Query first when updating or deleting existing rows.",
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
    };
  }

  private async getUserDbStub() {
    // Agent instances are named `${userDbName}:${conversationId}` (see the guard in server.ts).
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
    const uploadDir = `/uploads/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
    await workspace.mkdir(uploadDir, { recursive: true });

    const uploaded: WorkspaceUploadResult[] = [];
    for (const [index, file] of files.entries()) {
      const filename = `${String(index + 1).padStart(2, "0")}-${sanitizeWorkspaceFilename(file.filename)}`;
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
    // One directory per file keeps the basename clean (no collision prefixes)
    // so the download lands with the name the agent chose.
    const dir = `${DOWNLOAD_DIR}/${crypto.randomUUID()}`;
    const path = `${dir}/${filename}`;

    await workspace.mkdir(dir, { recursive: true });
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
    const filename = path.split("/").at(-1) || "download";
    const mediaType = stat?.mimeType || guessMediaType(filename);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { filename, mediaType, bytes: buffer };
  }
}
