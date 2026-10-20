import { mapStatementItemToTransaction } from "@productivity/core/monobank/mapping";
import { decideMonobankImport } from "@productivity/core/monobank/rules";
import { MONOBANK_PROVIDER_TYPE, monobankWebhookPayloadSchema } from "@productivity/core/monobank/types";
import { generateId } from "@sqlite-sync/core";
import { z } from "zod";
import { inferServerMonobankClassification } from "@/lib/monobank/inference";
import { defineJob } from "./jobs-base";

/**
 * Imports a single Monobank `StatementItem` webhook event into the synced DB as a transaction.
 *
 * All validation, dedupe and balance updates happen here so the public webhook route stays fast
 * and the DO remains the single writer. Writes go through CRDT events (not the client transaction
 * helpers) so they replicate; the sign/notes logic is shared with `src/lib/monobank/mapping.ts`.
 */
const importInputSchema = z.object({
  providerConnectionId: z.string(),
  payload: z.unknown(),
});

export type MonobankImportInput = z.infer<typeof importInputSchema>;

export const monobankImportJob = defineJob({ type: "monobank-import" })
  .input(importInputSchema)
  .handler(async ({ input, context }) => {
    const parsed = monobankWebhookPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      console.warn("[monobank-import] dropping malformed webhook payload", {
        providerConnectionId: input.providerConnectionId,
      });
      return;
    }

    const providerAccountId = parsed.data.data.account;
    const statementItem = parsed.data.data.statementItem;
    const now = Date.now();

    const [monoAccount] = context.syncDb.executeKysely((q) =>
      q
        .selectFrom("monobank_account")
        .selectAll()
        .where("providerConnectionId", "=", input.providerConnectionId)
        .where("providerAccountId", "=", providerAccountId),
    ).rows;

    if (!monoAccount) {
      console.log("[monobank-import] webhook for untracked account", {
        providerConnectionId: input.providerConnectionId,
        providerAccountId,
        statementId: statementItem.id,
      });
      return;
    }

    // Record the webhook on the account row regardless of whether the event ends up imported.
    context.syncDb.applyEvent({
      type: "item-updated",
      dataset: "_monobank_account",
      item_id: monoAccount.id,
      payload: { lastWebhookAt: now, updatedAt: now },
    });

    const mapped = mapStatementItemToTransaction(statementItem);
    const hasLink = monoAccount.linkedAccountId !== "";

    const [linkedAccount] = hasLink
      ? context.syncDb.executeKysely((q) =>
          q.selectFrom("account").selectAll().where("id", "=", monoAccount.linkedAccountId),
        ).rows
      : [];

    const accountsLinkedToTarget = hasLink
      ? context.syncDb.executeKysely((q) =>
          q.selectFrom("monobank_account").select(["id"]).where("linkedAccountId", "=", monoAccount.linkedAccountId),
        ).rows.length
      : 0;

    const alreadyImported =
      context.syncDb.executeKysely((q) =>
        q
          .selectFrom("transaction_entry")
          .select(["id"])
          .where("providerType", "=", MONOBANK_PROVIDER_TYPE)
          .where("providerId", "=", statementItem.id)
          .limit(1),
      ).rows.length > 0;

    const decision = decideMonobankImport({
      isZeroAmount: statementItem.amount === 0,
      hasLink,
      linkedAccountExists: Boolean(linkedAccount),
      currencyMatches:
        Boolean(linkedAccount) && monoAccount.currency !== "" && monoAccount.currency === linkedAccount?.currency,
      uniqueLink: accountsLinkedToTarget <= 1,
      alreadyImported,
    });

    if (decision.action === "skip") {
      console.log("[monobank-import] skipped", {
        providerAccountId,
        statementId: statementItem.id,
        reason: decision.reason,
      });
      if (decision.setError) {
        context.syncDb.applyEvent({
          type: "item-updated",
          dataset: "_monobank_account",
          item_id: monoAccount.id,
          payload: { lastError: skipReasonMessage(decision.reason), updatedAt: now },
        });
      }
      return;
    }

    if (!mapped || !linkedAccount) {
      // Unreachable given the decision above, but keeps the types honest.
      return;
    }

    const transactionId = generateId();
    const classification = await inferServerMonobankClassification(context.syncDb, context.env, mapped);
    context.syncDb.applyEvent({
      type: "item-created",
      dataset: "_transaction_entry",
      item_id: transactionId,
      payload: {
        id: transactionId,
        type: mapped.type,
        accountId: linkedAccount.id,
        accountCurrency: linkedAccount.currency,
        amount: mapped.amount,
        counterpartyAccountId: "",
        counterpartyCurrency: "",
        counterpartyAmount: null,
        title: mapped.title,
        category: classification.category,
        importance: classification.importance,
        notes: mapped.notes,
        effectiveAt: mapped.effectiveAt,
        createdAt: now,
        updatedAt: now,
        providerType: MONOBANK_PROVIDER_TYPE,
        providerId: statementItem.id,
      },
    });

    // Mirror `applyAccountDelta`: read-modify-write the balance by the signed imported amount.
    // Safe without locks because the DO is single-threaded and jobs serialize.
    context.syncDb.applyEvent({
      type: "item-updated",
      dataset: "_account",
      item_id: linkedAccount.id,
      payload: { balance: Number(linkedAccount.balance) + mapped.amount },
    });

    context.syncDb.applyEvent({
      type: "item-updated",
      dataset: "_monobank_account",
      item_id: monoAccount.id,
      payload: { lastImportAt: now, lastError: "", updatedAt: now },
    });

    console.log("[monobank-import] imported", {
      providerAccountId,
      statementId: statementItem.id,
      accountId: linkedAccount.id,
      amount: mapped.amount,
    });
  });

function skipReasonMessage(reason: string): string {
  switch (reason) {
    case "linked-account-missing":
      return "Linked account no longer exists.";
    case "currency-mismatch":
      return "Linked account currency does not match.";
    case "ambiguous-link":
      return "Multiple Monobank accounts link to the same in-app account.";
    default:
      return reason;
  }
}
