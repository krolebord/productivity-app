import { z } from "zod";
import { db } from "@/lib/db";
import {
  clearMonobankWebhook,
  fetchMonobankClientInfo,
  fetchMonobankStatement,
  MonobankApiError,
  type MonobankClientInfo,
  setMonobankWebhook,
} from "@/lib/monobank/api";
import { getMonobankConnectionByUserId } from "@/lib/monobank/connection-store";
import { statementItemToImportEntry } from "@/lib/monobank/mapping";
import { buildMonobankWebhookUrl, getUserDbStub, mapClientAccountsToMetadata } from "@/lib/monobank/server";
import type { MonobankWebhookStatus } from "@/lib/monobank/types";
import { protectedProcedure } from "../common/procedure";

const tokenInput = z.object({
  token: z.string().trim().min(20, "That does not look like a valid Monobank token."),
});

type WebhookOutcome = { webhookStatus: MonobankWebhookStatus; lastError: string };

/** Best-effort webhook (re)registration; never throws so the connection stays usable. */
async function trySetWebhook(token: string, url: string): Promise<WebhookOutcome> {
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

async function validateToken(
  token: string,
): Promise<{ ok: true; info: MonobankClientInfo } | { ok: false; message: string }> {
  try {
    return { ok: true, info: await fetchMonobankClientInfo(token) };
  } catch (error) {
    const message =
      error instanceof MonobankApiError
        ? "Could not validate the Monobank token. Check the token and try again."
        : "Could not reach Monobank. Try again shortly.";
    return { ok: false, message };
  }
}

const connect = protectedProcedure.input(tokenInput).handler(async ({ input, context, errors }) => {
  const token = input.token.trim();
  const userId = context.auth.userId;

  const validated = await validateToken(token);
  if (!validated.ok) {
    throw errors.BAD_REQUEST({ message: validated.message });
  }
  const info = validated.info;

  const now = new Date().toISOString();
  const existing = await getMonobankConnectionByUserId(userId);
  const id = existing?.id ?? crypto.randomUUID();
  const webhookSecret = existing?.webhookSecret ?? crypto.randomUUID().replace(/-/g, "");

  if (existing) {
    await db
      .updateTable("monobank_connection")
      .set({ token, status: "connected", lastValidatedAt: now, lastError: null, disconnectedAt: null, updatedAt: now })
      .where("id", "=", id)
      .execute();
  } else {
    await db
      .insertInto("monobank_connection")
      .values({
        id,
        userId,
        token,
        webhookSecret,
        status: "connected",
        webhookStatus: "pending",
        lastValidatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const outcome = await trySetWebhook(token, buildMonobankWebhookUrl(id, webhookSecret));
  await db
    .updateTable("monobank_connection")
    .set({ webhookStatus: outcome.webhookStatus, lastWebhookSetAt: now, lastError: outcome.lastError, updatedAt: now })
    .where("id", "=", id)
    .execute();

  const stub = await getUserDbStub(userId);
  await stub.enqueueMonobankMetadata({
    providerConnectionId: id,
    connection: {
      status: "connected",
      webhookStatus: outcome.webhookStatus,
      displayName: info.name,
      lastError: outcome.lastError,
      connectedAt: Date.now(),
    },
    accounts: mapClientAccountsToMetadata(info),
  });

  return { success: true as const };
});

const replaceToken = protectedProcedure.input(tokenInput).handler(async ({ input, context, errors }) => {
  const token = input.token.trim();
  const userId = context.auth.userId;

  const existing = await getMonobankConnectionByUserId(userId);
  if (!existing) {
    throw errors.BAD_REQUEST({ message: "Connect Monobank before replacing the token." });
  }

  const validated = await validateToken(token);
  if (!validated.ok) {
    throw errors.BAD_REQUEST({ message: validated.message });
  }
  const info = validated.info;

  const stub = await getUserDbStub(userId);
  const linkedAccountIds = await stub.getMonobankLinkedAccountIds(existing.id);
  const newAccountIds = new Set(info.accounts.map((account) => account.id));
  const missing = linkedAccountIds.filter((accountId) => !newAccountIds.has(accountId));
  if (missing.length > 0) {
    throw errors.BAD_REQUEST({
      message: "The new token does not expose every account you have already linked.",
    });
  }

  const now = new Date().toISOString();
  await db
    .updateTable("monobank_connection")
    .set({ token, status: "connected", lastValidatedAt: now, disconnectedAt: null, updatedAt: now })
    .where("id", "=", existing.id)
    .execute();

  const outcome = await trySetWebhook(token, buildMonobankWebhookUrl(existing.id, existing.webhookSecret));
  await db
    .updateTable("monobank_connection")
    .set({ webhookStatus: outcome.webhookStatus, lastWebhookSetAt: now, lastError: outcome.lastError, updatedAt: now })
    .where("id", "=", existing.id)
    .execute();

  await stub.enqueueMonobankMetadata({
    providerConnectionId: existing.id,
    connection: {
      status: "connected",
      webhookStatus: outcome.webhookStatus,
      displayName: info.name,
      lastError: outcome.lastError,
      connectedAt: Date.now(),
    },
    accounts: mapClientAccountsToMetadata(info),
  });

  return { success: true as const };
});

const refreshAccounts = protectedProcedure.handler(async ({ context, errors }) => {
  const userId = context.auth.userId;
  const existing = await getMonobankConnectionByUserId(userId);
  if (!existing) {
    throw errors.BAD_REQUEST({ message: "Connect Monobank first." });
  }

  const validated = await validateToken(existing.token);
  if (!validated.ok) {
    throw errors.BAD_REQUEST({ message: validated.message });
  }
  const info = validated.info;

  const now = new Date().toISOString();
  const outcome = await trySetWebhook(existing.token, buildMonobankWebhookUrl(existing.id, existing.webhookSecret));
  await db
    .updateTable("monobank_connection")
    .set({
      status: "connected",
      webhookStatus: outcome.webhookStatus,
      lastValidatedAt: now,
      lastWebhookSetAt: now,
      lastError: outcome.lastError,
      updatedAt: now,
    })
    .where("id", "=", existing.id)
    .execute();

  const stub = await getUserDbStub(userId);
  await stub.enqueueMonobankMetadata({
    providerConnectionId: existing.id,
    connection: {
      status: "connected",
      webhookStatus: outcome.webhookStatus,
      displayName: info.name,
      lastError: outcome.lastError,
      connectedAt: Date.now(),
    },
    accounts: mapClientAccountsToMetadata(info),
  });

  return { success: true as const };
});

const disconnect = protectedProcedure.handler(async ({ context }) => {
  const userId = context.auth.userId;
  const existing = await getMonobankConnectionByUserId(userId);
  if (!existing) {
    return { success: true as const };
  }

  // Best-effort: clear the webhook so Monobank stops sending events. Continue even if it fails.
  try {
    await clearMonobankWebhook(existing.token);
  } catch {
    // ignore — disconnect proceeds regardless
  }

  const now = new Date().toISOString();
  await db
    .updateTable("monobank_connection")
    .set({ status: "disconnected", webhookStatus: "pending", disconnectedAt: now, lastError: null, updatedAt: now })
    .where("id", "=", existing.id)
    .execute();

  const stub = await getUserDbStub(userId);
  await stub.enqueueMonobankMetadata({
    providerConnectionId: existing.id,
    connection: {
      status: "disconnected",
      webhookStatus: "pending",
      displayName: "",
      lastError: "",
      connectedAt: 0,
    },
  });

  return { success: true as const };
});

// Best-effort backfill: fetch a single recent statement window for one account. Monobank caps the
// range at 31 days and rate limits to one request per 60s, so this is "recent", not full history.
const getRecentStatement = protectedProcedure
  .input(
    z.object({
      providerAccountId: z.string(),
      days: z.number().int().min(1).max(31).default(31),
    }),
  )
  .handler(async ({ input, context, errors }) => {
    const existing = await getMonobankConnectionByUserId(context.auth.userId);
    if (!existing) {
      throw errors.BAD_REQUEST({ message: "Connect Monobank first." });
    }

    const fromSeconds = Math.floor(Date.now() / 1000) - input.days * 24 * 60 * 60;
    try {
      const items = await fetchMonobankStatement(existing.token, input.providerAccountId, fromSeconds);
      // Map to app transaction entries server-side (same as the webhook path), dropping zero-amount
      // items, so the client just displays and inserts.
      const entries = items.map(statementItemToImportEntry).filter((entry) => entry !== null);
      return { entries };
    } catch (error) {
      const message =
        error instanceof MonobankApiError && error.status === 429
          ? "Monobank is rate-limiting requests. Wait a minute and try again."
          : "Could not fetch transactions from Monobank.";
      throw errors.BAD_REQUEST({ message });
    }
  });

export const integrationsRouter = {
  monobank: {
    connect,
    replaceToken,
    refreshAccounts,
    disconnect,
    getRecentStatement,
  },
};
