import { db } from "@/lib/db";
import { setMonobankWebhook } from "./api";
import { buildMonobankWebhookUrl, getUserDbStub } from "./server";
import type { MonobankWebhookStatus } from "./types";

const WEBHOOK_RENEWAL_MIN_AGE_MS = 11 * 60 * 60 * 1000;
const WEBHOOK_RENEWAL_BATCH_LIMIT = 50;

export type MonobankWebhookOutcome = { webhookStatus: MonobankWebhookStatus; lastError: string };

/** Best-effort webhook (re)registration; never throws so the connection stays usable. */
export async function trySetMonobankWebhook(token: string, url: string): Promise<MonobankWebhookOutcome> {
  try {
    await setMonobankWebhook(token, url);
    return { webhookStatus: "active", lastError: "" };
  } catch (error) {
    return {
      webhookStatus: "error",
      lastError: error instanceof Error ? error.message : "Failed to set the Monobank webhook.",
    };
  }
}

export async function renewDueMonobankWebhooks(now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const staleBeforeIso = new Date(now - WEBHOOK_RENEWAL_MIN_AGE_MS).toISOString();
  const connections = await db
    .selectFrom("monobank_connection")
    .selectAll()
    .where("status", "=", "connected")
    .where((eb) =>
      eb.or([
        eb("webhookStatus", "!=", "active"),
        eb("lastWebhookSetAt", "is", null),
        eb("lastWebhookSetAt", "<=", staleBeforeIso),
      ]),
    )
    .orderBy("lastWebhookSetAt", "asc")
    .limit(WEBHOOK_RENEWAL_BATCH_LIMIT)
    .execute();

  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      const outcome = await trySetMonobankWebhook(
        connection.token,
        buildMonobankWebhookUrl(connection.id, connection.webhookSecret),
      );
      const nextLastWebhookSetAt = outcome.webhookStatus === "active" ? nowIso : (connection.lastWebhookSetAt ?? null);

      await db
        .updateTable("monobank_connection")
        .set({
          webhookStatus: outcome.webhookStatus,
          lastWebhookSetAt: nextLastWebhookSetAt,
          lastError: outcome.lastError,
          updatedAt: nowIso,
        })
        .where("id", "=", connection.id)
        .execute();

      try {
        const stub = await getUserDbStub(connection.userId);
        await stub.enqueueMonobankMetadata({
          providerConnectionId: connection.id,
          connection: {
            status: "connected",
            webhookStatus: outcome.webhookStatus,
            displayName: "",
            lastError: outcome.lastError,
            connectedAt: 0,
          },
        });
      } catch (error) {
        console.error("[monobank-webhook-renewal] failed to mirror metadata", {
          connectionId: connection.id,
          error,
        });
      }

      if (outcome.webhookStatus === "active") {
        succeeded += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("[monobank-webhook-renewal] failed to renew webhook", {
        connectionId: connection.id,
        error,
      });
    }
  }

  return { checked: connections.length, succeeded, failed };
}
