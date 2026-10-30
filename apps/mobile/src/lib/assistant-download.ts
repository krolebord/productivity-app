import type { ConversationTurnFile } from "@productivity/core/agent/conversation-files";
import { assistantDownloadPath } from "@productivity/core/agent/tool-messages";
import { Directory, File as FsFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getApiSessionToken } from "./api";
import { API_URL } from "./config";

/**
 * Fetches a file the agent saved and opens the share sheet for it. The web links straight to
 * the endpoint with its cookie; here the session goes in the header, so the file is
 * downloaded into the cache first.
 */
export async function shareAssistantDownload(conversationId: string, file: ConversationTurnFile) {
  const token = getApiSessionToken();
  const directory = new Directory(Paths.cache, "assistant-downloads");
  directory.create({ intermediates: true, idempotent: true });
  const downloaded = await FsFile.downloadFileAsync(
    `${API_URL}${assistantDownloadPath(conversationId, file.path)}`,
    new FsFile(directory, file.filename),
    { headers: token ? { authorization: `Bearer ${token}` } : {}, idempotent: true },
  );
  await Sharing.shareAsync(downloaded.uri, { mimeType: file.mediaType, dialogTitle: file.filename });
}
