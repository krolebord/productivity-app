import { generateId } from "@sqlite-sync/core";
import { z } from "zod";
import { defineJob } from "./jobs-base";

const accountSchema = z.object({
  providerAccountId: z.string(),
  displayName: z.string(),
  accountType: z.string(),
  currency: z.string(),
  maskedPan: z.string(),
});

const metadataInputSchema = z.object({
  providerConnectionId: z.string(),
  connection: z.object({
    status: z.string(),
    webhookStatus: z.string(),
    displayName: z.string(),
    lastError: z.string(),
    connectedAt: z.number(),
  }),
  accounts: z.array(accountSchema).optional(),
});

export type MonobankMetadataInput = z.infer<typeof metadataInputSchema>;

/**
 * Upserts the synced display/status metadata for a Monobank connection and its accounts.
 *
 * Connection rows are keyed by `providerConnectionId`; account rows by
 * `(providerConnectionId, providerAccountId)`. Existing `linkedAccountId`/`enabled` values are
 * preserved, and accounts not present in the input are left untouched (no deletes in v1).
 */
export const monobankMetadataJob = defineJob({ type: "monobank-metadata" })
  .input(metadataInputSchema)
  .handler(async ({ input, context }) => {
    const now = Date.now();
    const { providerConnectionId, connection, accounts } = input;

    const [existingConnection] = context.syncDb.executeKysely((q) =>
      q.selectFrom("monobank_connection").selectAll().where("providerConnectionId", "=", providerConnectionId),
    ).rows;

    if (existingConnection) {
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-updated",
          dataset: "_monobank_connection",
          item_id: existingConnection.id,
          payload: {
            status: connection.status,
            webhookStatus: connection.webhookStatus,
            // Empty input displayName means "leave as-is" (e.g. on disconnect, which has no name).
            displayName: connection.displayName || existingConnection.displayName,
            lastError: connection.lastError,
            connectedAt: existingConnection.connectedAt > 0 ? existingConnection.connectedAt : connection.connectedAt,
            updatedAt: now,
          },
        }),
      );
    } else {
      const id = generateId();
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-created",
          dataset: "_monobank_connection",
          item_id: id,
          payload: {
            id,
            providerConnectionId,
            status: connection.status,
            webhookStatus: connection.webhookStatus,
            displayName: connection.displayName,
            lastError: connection.lastError,
            connectedAt: connection.connectedAt,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
    }

    if (!accounts) {
      return;
    }

    for (const account of accounts) {
      const [existingAccount] = context.syncDb.executeKysely((q) =>
        q
          .selectFrom("monobank_account")
          .selectAll()
          .where("providerConnectionId", "=", providerConnectionId)
          .where("providerAccountId", "=", account.providerAccountId),
      ).rows;

      if (existingAccount) {
        context.syncDb.enqueueEvent(
          context.syncDb.createEvent({
            type: "item-updated",
            dataset: "_monobank_account",
            item_id: existingAccount.id,
            payload: {
              displayName: account.displayName,
              accountType: account.accountType,
              currency: account.currency,
              maskedPan: account.maskedPan,
              updatedAt: now,
            },
          }),
        );
      } else {
        const id = generateId();
        context.syncDb.enqueueEvent(
          context.syncDb.createEvent({
            type: "item-created",
            dataset: "_monobank_account",
            item_id: id,
            payload: {
              id,
              providerConnectionId,
              providerAccountId: account.providerAccountId,
              displayName: account.displayName,
              accountType: account.accountType,
              currency: account.currency,
              maskedPan: account.maskedPan,
              linkedAccountId: "",
              enabled: true,
              lastWebhookAt: null,
              lastImportAt: null,
              lastError: "",
              createdAt: now,
              updatedAt: now,
            },
          }),
        );
      }
    }
  });
