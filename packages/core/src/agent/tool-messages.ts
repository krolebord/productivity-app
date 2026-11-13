import type { ConversationTurnFile } from "./conversation-files";

// Parsers for the JSON the agent stores in a tool message's `data`, shared by the web and
// mobile chat renderers. Payloads come from the model's tool calls, so every field is optional
// and validated loosely: a malformed payload degrades to a plain chip rather than throwing.

export type ToolLink = { title?: string | null; url: string };

export type WebToolPayload = {
  query?: string;
  answer?: string;
  urlCount?: number;
  results?: ToolLink[];
  failedResults?: ToolLink[];
};
export type MemoryToolPayload = { content?: string };
export type ReadToolPayload = { path?: string };
export type SkillToolPayload = { id?: string | null; name?: string };

export type MemoryToolName = "remember" | "update_memory" | "forget";

export function parseToolData(data: string): unknown {
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function toolPayload<T>(data: string): T {
  const parsed = parseToolData(data);
  return (parsed && typeof parsed === "object" ? parsed : {}) as T;
}

export function toolLinks(value: ToolLink[] | undefined): ToolLink[] {
  return Array.isArray(value) ? value.filter((link) => typeof link?.url === "string") : [];
}

export function linkHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function resourceFilename(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").at(-1) || path;
}

/** The one-line summary next to a web tool's name: the query, or how many pages were read. */
export function webToolSummary(name: string, payload: WebToolPayload): string | undefined {
  if (name === "web_search") return payload.query;
  if (!payload.urlCount) return undefined;
  return `${payload.urlCount} ${payload.urlCount === 1 ? "page" : "pages"}`;
}

export function memoryToolLabel(name: MemoryToolName) {
  if (name === "forget") return "Forgot a memory";
  if (name === "update_memory") return "Updated a memory";
  return "Remembered";
}

/** Not a model tool: the row the agent adds when it replaces older history with a summary. */
export const CONTEXT_SUMMARY_TOOL_NAME = "summarize_context";

const TOOL_LABELS: Record<string, string> = {
  [CONTEXT_SUMMARY_TOOL_NAME]: "Summarized earlier messages",
  getDbSchema: "Checked data structure",
  queryDb: "Queried your data",
  mutateDb: "Updated your data",
  execute: "Ran code",
  renderChart: "Drew a chart",
  renderTransactions: "Listed transactions",
  saveDownload: "Saved a file",
};

/** A readable label for a tool row without a dedicated renderer; unknown names are humanized. */
export function toolLabel(name: string): string {
  const known = TOOL_LABELS[name];
  if (known) return known;
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Used a tool";
}

export function isMemoryToolName(name: string): name is MemoryToolName {
  return name === "remember" || name === "update_memory" || name === "forget";
}

/** A file the agent saved for download (`saveDownload`), or null when the payload is unusable. */
export function downloadFileFromData(data: string): ConversationTurnFile | null {
  const parsed = parseToolData(data);
  if (!parsed || typeof parsed !== "object") return null;
  const file = parsed as Partial<ConversationTurnFile>;
  if (typeof file.filename !== "string" || typeof file.path !== "string") return null;
  return {
    filename: file.filename,
    mediaType: typeof file.mediaType === "string" ? file.mediaType : "application/octet-stream",
    size: typeof file.size === "number" ? file.size : 0,
    path: file.path,
  };
}

/** Relative URL of the authenticated download endpoint for a file the agent saved. */
export function assistantDownloadPath(conversationId: string, path: string) {
  return `/api/assistant/download?conversationId=${encodeURIComponent(conversationId)}&path=${encodeURIComponent(path)}`;
}
