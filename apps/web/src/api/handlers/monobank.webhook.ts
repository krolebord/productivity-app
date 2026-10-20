import { monobankWebhookPayloadSchema } from "@productivity/core/monobank/types";
import { getMonobankConnectionById } from "@/lib/monobank/connection-store";
import { getUserDbStub } from "@/lib/monobank/server";
import type { ApiHandler } from "../api-handler";

export const MONOBANK_WEBHOOK_PREFIX = "/api/monobank/webhook/";

/**
 * Public Monobank statement webhook: `/api/monobank/webhook/:connectionId/:webhookSecret`.
 *
 * Always responds 200 quickly and never reveals which ids exist. Monobank verifies the URL with a
 * GET (which must return 200) when the webhook is registered. Valid `StatementItem` POSTs are
 * handed to the user's `UserDbServer`, which is the single writer — no transactions are created
 * inline here.
 */
export const monobankWebhookHandler: ApiHandler = async ({ request, context }) => {
  const ok = () => new Response("ok", { status: 200 });

  if (request.method !== "POST") {
    return ok();
  }

  const rest = context.url.pathname.slice(MONOBANK_WEBHOOK_PREFIX.length);
  const [connectionId, webhookSecret] = rest.split("/");
  if (!connectionId || !webhookSecret) {
    return ok();
  }

  const connection = await getMonobankConnectionById(connectionId);
  if (!connection || connection.webhookSecret !== webhookSecret || connection.status === "disconnected") {
    return ok();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ok();
  }

  const parsed = monobankWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return ok();
  }

  try {
    const stub = await getUserDbStub(connection.userId);
    await stub.enqueueMonobankImport({ providerConnectionId: connection.id, payload: parsed.data });
  } catch (error) {
    console.error("Failed to enqueue Monobank import", error);
  }

  return ok();
};
