import type { SQLiteDbWrapper } from "@sqlite-sync/core";
import type { UserDb } from "@/user-db/migrations";
import { validateMonobankLink } from "./rules";

type LinkDatabase = Pick<SQLiteDbWrapper<UserDb>, "executeTransaction">;

/**
 * Link (or, with an empty `linkedAccountId`, unlink) a Monobank account to an in-app account by
 * writing directly to the synced DB. Validates currency and exclusivity locally; the import job
 * re-checks every rule before inserting transactions.
 */
export function linkMonobankAccount(db: LinkDatabase, providerAccountId: string, linkedAccountId: string) {
  db.executeTransaction((trx) => {
    const [monoAccount] = trx.executeKysely((q) =>
      q.selectFrom("monobank_account").selectAll().where("providerAccountId", "=", providerAccountId),
    ).rows;

    if (!monoAccount) {
      throw new Error("Monobank account not found.");
    }

    const now = Date.now();

    if (linkedAccountId === "") {
      trx.executeKysely((q) =>
        q
          .updateTable("monobank_account")
          .set({ linkedAccountId: "", lastError: "", updatedAt: now })
          .where("id", "=", monoAccount.id),
      );
      return;
    }

    const [account] = trx.executeKysely((q) =>
      q.selectFrom("account").selectAll().where("id", "=", linkedAccountId),
    ).rows;

    if (!account) {
      throw new Error("In-app account not found.");
    }

    const otherMonoAccountsLinkedToTarget = trx.executeKysely((q) =>
      q
        .selectFrom("monobank_account")
        .select(["id"])
        .where("linkedAccountId", "=", linkedAccountId)
        .where("providerAccountId", "!=", providerAccountId),
    ).rows.length;

    const validation = validateMonobankLink({
      monoCurrency: monoAccount.currency,
      appAccountCurrency: account.currency,
      otherMonoAccountsLinkedToTarget,
    });

    if (!validation.ok) {
      throw new Error(validation.error);
    }

    trx.executeKysely((q) =>
      q
        .updateTable("monobank_account")
        .set({ linkedAccountId, lastError: "", updatedAt: now })
        .where("id", "=", monoAccount.id),
    );
  });
}
