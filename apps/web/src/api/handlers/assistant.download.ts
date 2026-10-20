import { getAgentByName } from "agents";
import { z } from "zod";
import { isDownloadPath } from "@/agent/assistant-agent";
import { getUserIdFromRequest } from "@/lib/auth-server";
import { getContext } from "@/lib/context";
import type { ApiHandler } from "../api-handler";

const downloadSchema = z.object({
  conversationId: z.string().min(1),
  path: z.string().min(1).refine(isDownloadPath, "Invalid file path."),
});

export const assistantDownloadHandler: ApiHandler = async ({ request }) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const env = getContext();
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = downloadSchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
    path: url.searchParams.get("path"),
  });
  if (!parsed.success) {
    return new Response("Bad request", { status: 400 });
  }
  const { conversationId, path } = parsed.data;

  const agent = await getAgentByName(env.AssistantAgent, `user-${userId}:${conversationId}`, { locationHint: "weur" });
  const file = await agent.readDownloadFile(path);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file.bytes, {
    headers: {
      "Content-Type": file.mediaType,
      "Content-Length": String(file.bytes.byteLength),
      // file.filename is sanitized to [a-zA-Z0-9._-] at save time, so it is safe to embed directly.
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
