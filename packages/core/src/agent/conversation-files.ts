/** Files attached to a user turn, stored as `{ files }` JSON in `conversation_message.data`. */
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
