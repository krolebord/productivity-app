import type { StepContext } from "@cloudflare/think";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

export type ConversationMessageSnapshot = {
  id: string;
  conversationId: string;
  seq: number;
  role: "user" | "assistant";
  kind: "text" | "tool";
  text: string;
  toolName: string;
  toolCallId: string;
  toolState: string;
  data: string;
  createdAt: number;
};

export type StepToolSnapshot = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  error: boolean;
};

export type UiMessageStepPart = {
  index: number;
  part: UIMessage["parts"][number];
};

export function uiMessageStepParts(input: { message: UIMessage; stepNumber: number }): UiMessageStepPart[] {
  const parts: UiMessageStepPart[] = [];
  let currentStep = -1;

  for (const [index, part] of input.message.parts.entries()) {
    if (part.type === "step-start") {
      currentStep += 1;
      continue;
    }
    if (currentStep === input.stepNumber) {
      parts.push({ index, part });
    }
  }

  return parts;
}

export function stepToolsFromContext(ctx: Pick<StepContext, "content" | "toolCalls">): StepToolSnapshot[] {
  const outcomes = new Map<string, Pick<StepToolSnapshot, "output" | "error">>();
  for (const part of ctx.content) {
    if (part.type === "tool-result") {
      outcomes.set(part.toolCallId, { output: part.output, error: false });
    } else if (part.type === "tool-error") {
      outcomes.set(part.toolCallId, { output: part.error, error: true });
    }
  }

  return ctx.toolCalls.map((call) => {
    const outcome = outcomes.get(call.toolCallId);
    return {
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
      output: outcome?.output,
      error: outcome?.error ?? false,
    };
  });
}

export const WORKSPACE_FILES_PREFIX = "Uploaded files are available in the agent workspace:";

export type ConversationTurnFile = {
  filename: string;
  mediaType: string;
  size: number;
  path: string;
};

function isConversationTurnFile(value: unknown): value is ConversationTurnFile {
  if (typeof value !== "object" || value === null) return false;
  if (!("filename" in value) || typeof value.filename !== "string") return false;
  if (!("mediaType" in value) || typeof value.mediaType !== "string") return false;
  if (!("size" in value) || typeof value.size !== "number" || !Number.isFinite(value.size)) return false;
  if (!("path" in value) || typeof value.path !== "string") return false;
  return true;
}

export function conversationTurnFilesFromData(data: string): ConversationTurnFile[] {
  if (!data) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || !("files" in parsed) || !Array.isArray(parsed.files)) {
    return [];
  }
  return parsed.files.filter(isConversationTurnFile);
}

export function conversationTurnFilesData(files: readonly ConversationTurnFile[]): string {
  if (files.length === 0) return "";
  return JSON.stringify({ files });
}

export function workspaceFilesPrompt(files: readonly ConversationTurnFile[]): string {
  if (files.length === 0) return "";
  return [
    WORKSPACE_FILES_PREFIX,
    ...files.map((file) => `- ${file.filename}: ${file.path} (${file.mediaType}, ${file.size} bytes)`),
  ].join("\n");
}

export function userTurnModelText(text: string, files: readonly ConversationTurnFile[]): string {
  return [text.trim(), workspaceFilesPrompt(files)].filter(Boolean).join("\n\n");
}

export function toolProjectionId(sessionMessageId: string, toolCallId: string) {
  return `${sessionMessageId}:tool:${toolCallId}`;
}

export function textProjectionId(sessionMessageId: string, index: number) {
  return `${sessionMessageId}:text:${index}`;
}

// Separate namespace from textProjectionId: the step-summary fallback knows the step but
// not the part index, so the two schemes must not half-collide on the same message.
export function stepTextProjectionId(sessionMessageId: string, stepNumber: number) {
  return `${sessionMessageId}:step-text:${stepNumber}`;
}

export function conversationTitleFromTurnText(text: string, filenames: readonly string[] = []): string {
  const trimmed = text.trim();
  const suffixAt = trimmed.indexOf(WORKSPACE_FILES_PREFIX);
  const prose = (suffixAt === -1 ? trimmed : trimmed.slice(0, suffixAt)).trim();
  if (prose) return prose.slice(0, 80);

  if (suffixAt !== -1) {
    const names = trimmed
      .slice(suffixAt + WORKSPACE_FILES_PREFIX.length)
      .split("\n")
      .map((line) => {
        const item = line.trim().replace(/^- /, "");
        const colon = item.indexOf(":");
        return (colon === -1 ? item : item.slice(0, colon)).trim();
      })
      .filter(Boolean);
    if (names.length > 0) return names.join(", ").slice(0, 80);
  }

  return filenames.filter(Boolean).join(", ").slice(0, 80);
}

function jsonData(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

const WEB_ANSWER_LIMIT = 600;
const WEB_RESULT_LIMIT = 8;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function linkList(value: unknown): { title?: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  const links: { title?: string; url: string }[] = [];
  for (const entry of value.slice(0, WEB_RESULT_LIMIT)) {
    const url = asText(asRecord(entry)?.url);
    if (!url) continue;
    const title = asText(asRecord(entry)?.title);
    links.push(title ? { title, url } : { url });
  }
  return links;
}

function toolPayloadData(toolName: string, input: unknown, output: unknown): string {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(output);

  switch (toolName) {
    case "renderChart":
      return jsonData(inputRecord?.chart ?? input);
    case "renderTransactions":
      return jsonData(input);
    case "saveDownload":
      return jsonData(output);
    case "web_search":
      return jsonData({
        query: asText(inputRecord?.query),
        answer: asText(outputRecord?.answer)?.slice(0, WEB_ANSWER_LIMIT),
        results: linkList(outputRecord?.results),
      });
    case "web_extract":
      return jsonData({
        urlCount: Array.isArray(inputRecord?.urls) ? inputRecord.urls.length : undefined,
        results: linkList(outputRecord?.results),
        failedResults: linkList(outputRecord?.failedResults),
      });
    case "remember":
    case "update_memory":
      return jsonData({ content: asText(inputRecord?.content) });
    case "read":
    case "read_skill_resource":
      return jsonData({ path: asText(inputRecord?.path) });
    case "activate_skill":
      return jsonData({ name: asText(inputRecord?.name) });
    case "create_skill":
      return jsonData({
        id: asText(outputRecord?.id) ?? null,
        name: asText(outputRecord?.name) ?? asText(inputRecord?.name),
      });
    default:
      return "";
  }
}

function userTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function textRow(input: {
  id: string;
  conversationId: string;
  seq: number;
  role: ConversationMessageSnapshot["role"];
  text: string;
  createdAt: number;
}): ConversationMessageSnapshot {
  return {
    id: input.id,
    conversationId: input.conversationId,
    seq: input.seq,
    role: input.role,
    kind: "text",
    text: input.text,
    toolName: "",
    toolCallId: "",
    toolState: "",
    data: "",
    createdAt: input.createdAt,
  };
}

function toolRow(input: {
  sessionMessageId: string;
  conversationId: string;
  seq: number;
  toolCallId: string;
  toolName: string;
  failed: boolean;
  input: unknown;
  output: unknown;
  createdAt: number;
}): ConversationMessageSnapshot {
  return {
    id: toolProjectionId(input.sessionMessageId, input.toolCallId),
    conversationId: input.conversationId,
    seq: input.seq,
    role: "assistant",
    kind: "tool",
    text: "",
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    toolState: input.failed ? "error" : "done",
    data: toolPayloadData(input.toolName, input.input, input.output),
    createdAt: input.createdAt,
  };
}

// Null for parts the UI never draws. The only place a part's row id is derived, so a live
// step write and a later backfill of the same message target the same row.
function assistantPartRow(input: {
  conversationId: string;
  sessionMessageId: string;
  index: number;
  part: UIMessage["parts"][number];
  seq: number;
  createdAt: number;
}): ConversationMessageSnapshot | null {
  const { part } = input;

  if (part.type === "text") {
    if (!part.text) return null;
    return textRow({
      id: textProjectionId(input.sessionMessageId, input.index),
      conversationId: input.conversationId,
      seq: input.seq,
      role: "assistant",
      text: part.text,
      createdAt: input.createdAt,
    });
  }

  if (part.type !== "dynamic-tool" && !isToolUIPart(part)) return null;

  return toolRow({
    sessionMessageId: input.sessionMessageId,
    conversationId: input.conversationId,
    seq: input.seq,
    toolCallId: part.toolCallId,
    toolName: part.type === "dynamic-tool" ? part.toolName : getToolName(part),
    failed: part.state === "output-error" || part.state === "output-denied",
    input: "input" in part ? part.input : undefined,
    output: "output" in part ? part.output : undefined,
    createdAt: input.createdAt,
  });
}

export function projectionRowsFromUiMessages(input: {
  conversationId: string;
  messages: UIMessage[];
  createdAt?: number;
}): ConversationMessageSnapshot[] {
  const createdAt = input.createdAt ?? Date.now();
  const rows: ConversationMessageSnapshot[] = [];
  let seq = 1;

  for (const message of input.messages) {
    if (message.role === "user") {
      rows.push(
        textRow({
          id: message.id,
          conversationId: input.conversationId,
          seq: seq++,
          role: "user",
          text: userTextFromMessage(message),
          createdAt,
        }),
      );
      continue;
    }
    if (message.role !== "assistant") continue;

    for (const [index, part] of message.parts.entries()) {
      const row = assistantPartRow({
        conversationId: input.conversationId,
        sessionMessageId: message.id,
        index,
        part,
        seq,
        createdAt,
      });
      if (!row) continue;
      rows.push(row);
      seq++;
    }
  }

  return rows;
}

export function projectionRowsFromStep(input: {
  conversationId: string;
  sessionMessageId: string;
  stepNumber: number;
  startSeq: number;
  createdAt: number;
  text: string;
  tools: StepToolSnapshot[];
  orderedParts?: UiMessageStepPart[];
}): ConversationMessageSnapshot[] {
  const rows: ConversationMessageSnapshot[] = [];
  let seq = input.startSeq;

  if (input.orderedParts) {
    for (const { index, part } of input.orderedParts) {
      const row = assistantPartRow({
        conversationId: input.conversationId,
        sessionMessageId: input.sessionMessageId,
        index,
        part,
        seq,
        createdAt: input.createdAt,
      });
      if (!row) continue;
      rows.push(row);
      seq++;
    }

    return rows;
  }

  // Fallback for a step whose parts are not attributable to it: same rows, built from the
  // step context instead of the message.
  for (const tool of input.tools) {
    rows.push(
      toolRow({
        sessionMessageId: input.sessionMessageId,
        conversationId: input.conversationId,
        seq: seq++,
        toolCallId: tool.toolCallId,
        toolName: tool.toolName,
        failed: tool.error,
        input: tool.input,
        output: tool.output,
        createdAt: input.createdAt,
      }),
    );
  }

  if (input.text) {
    rows.push(
      textRow({
        id: stepTextProjectionId(input.sessionMessageId, input.stepNumber),
        conversationId: input.conversationId,
        seq: seq++,
        role: "assistant",
        text: input.text,
        createdAt: input.createdAt,
      }),
    );
  }

  return rows;
}
