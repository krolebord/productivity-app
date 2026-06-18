import { getAgentByName } from "agents";
import { z } from "zod";
import { isAssistantAllowed } from "@/lib/assistant-access";
import { getAuthFromRequest } from "@/lib/auth-server";
import { getContext } from "@/lib/context";
import type { ApiHandler } from "../api-handler";

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 6 * 1024 * 1024;

const uploadSchema = z.object({
  conversationId: z.string().min(1),
});

export const assistantUploadHandler: ApiHandler = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_MULTIPART_BYTES) {
    return Response.json({ error: "Upload is too large." }, { status: 413 });
  }

  const env = getContext();
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isAssistantAllowed(auth.userEmail)) {
    return new Response("Assistant is not enabled for this account.", { status: 403 });
  }
  const userId = auth.userId;

  const formData = await request.formData();
  const parsed = uploadSchema.safeParse({
    conversationId: formData.get("conversationId"),
  });
  if (!parsed.success) {
    return Response.json({ error: "Missing conversation." }, { status: 400 });
  }
  const { conversationId } = parsed.data;

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "No files uploaded." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return Response.json({ error: `Upload at most ${MAX_FILES} files.` }, { status: 400 });
  }

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return Response.json({ error: "Combined upload is too large." }, { status: 413 });
  }

  const agent = await getAgentByName(env.AssistantAgent, `user-${userId}:${conversationId}`, { locationHint: "weur" });
  const uploaded = await agent.uploadWorkspaceFiles(
    await Promise.all(
      files.map(async (file) => ({
        filename: file.name || "upload",
        mediaType: file.type || "application/octet-stream",
        bytes: await file.arrayBuffer(),
      })),
    ),
  );

  return Response.json({ files: uploaded });
};
