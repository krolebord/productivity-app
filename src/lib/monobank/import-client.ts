import type { SyncedDbDatabase } from "@sqlite-sync/core";
import { createTransactionInTransaction } from "@/lib/transactions";
import type { UserDb } from "@/user-db/migrations";
import { inferClientMonobankClassification } from "./inference";
import type { MonobankImportEntry } from "./mapping";
import { MONOBANK_PROVIDER_TYPE } from "./types";

type ImportDatabase = Pick<SyncedDbDatabase<UserDb>, "executeTransaction">;

/**
 * Insert pre-mapped Monobank entries into the synced DB, using the same client path as manual
 * transaction entry (`createTransactionInTransaction` handles sign + balance). Skips currency
 * mismatches and rows that already exist for the same provider id. Returns the number imported.
 */
export function importMonobankStatementItems(
  db: ImportDatabase,
  providerAccountId: string,
  entries: MonobankImportEntry[],
): number {
  let imported = 0;

  db.executeTransaction((trx) => {
    const [monoAccount] = trx.executeKysely((q) =>
      q.selectFrom("monobank_account").selectAll().where("providerAccountId", "=", providerAccountId),
    ).rows;

    if (!monoAccount || !monoAccount.linkedAccountId) {
      return;
    }

    const [account] = trx.executeKysely((q) =>
      q.selectFrom("account").selectAll().where("id", "=", monoAccount.linkedAccountId),
    ).rows;

    if (!account || monoAccount.currency === "" || monoAccount.currency !== account.currency) {
      return;
    }

    for (const entry of entries) {
      const [duplicate] = trx.executeKysely((q) =>
        q
          .selectFrom("transaction_entry")
          .select(["id"])
          .where("providerType", "=", MONOBANK_PROVIDER_TYPE)
          .where("providerId", "=", entry.providerId)
          .limit(1),
      ).rows;
      if (duplicate) {
        continue;
      }

      const classification = inferClientMonobankClassification(trx, entry);
      const baseInput = {
        accountId: account.id,
        amount: Math.abs(entry.amount),
        category: classification.category,
        effectiveAt: entry.effectiveAt,
        title: entry.title,
        notes: entry.notes,
        providerType: MONOBANK_PROVIDER_TYPE,
        providerId: entry.providerId,
      };

      createTransactionInTransaction(
        trx,
        entry.type === "expense"
          ? { ...baseInput, type: entry.type, importance: classification.importance }
          : { ...baseInput, type: entry.type },
      );
      imported += 1;
    }

    if (imported > 0) {
      const now = Date.now();
      trx.executeKysely((q) =>
        q.updateTable("monobank_account").set({ lastImportAt: now, updatedAt: now }).where("id", "=", monoAccount.id),
      );
    }
  });

  return imported;
}
