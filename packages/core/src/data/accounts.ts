import { generateId } from "@sqlite-sync/core";
import { useCallback, useState } from "react";
import { reorderByOrder } from "../reorder";
import { createTransactionInTransaction } from "../transactions";
import { type UserDbDatabase, useDb, useDbQuery } from "../user-db/db-context";
import type { AccountItem } from "../user-db/migrations";

export type AccountFields = Pick<AccountItem, "currency" | "description" | "labelColor" | "labelText"> & {
  balance: number;
};

export function useAccounts() {
  const { data } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"));
  return data;
}

/**
 * Accounts stamped with the time the query delivered them, so a caller painting an optimistic
 * reorder can tell whether the query has caught up with it.
 */
export function useTimestampedAccounts() {
  const { data } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"), {
    mapData: (accounts) => ({ accounts, timestamp: Date.now() }),
  });
  return data;
}

export function useAccount(accountId: string | null | undefined) {
  const { data } = useDbQuery((q) =>
    q
      .selectFrom("account")
      .selectAll()
      .where("id", "=", accountId ?? ""),
  );
  return data[0];
}

export function useAccountHasTransactions(accountId: string | null | undefined) {
  const { data } = useDbQuery((q) =>
    q
      .selectFrom("transaction_entry")
      .select(["id"])
      .where((eb) => eb.or([eb("accountId", "=", accountId ?? ""), eb("counterpartyAccountId", "=", accountId ?? "")]))
      .limit(1),
  );
  return data.length > 0;
}

export function useAccountLabels() {
  const { data } = useDbQuery((db) => db.selectFrom("account").select(["id", "labelText"]));
  return data;
}

export function createAccount(db: UserDbDatabase, fields: AccountFields) {
  const id = generateId();
  const createdAt = Date.now();

  db.executeTransaction((trx) => {
    const [maxOrderRow] = trx.executeKysely((q) =>
      q.selectFrom("account").select((eb) => eb.fn.max("order").as("maxOrder")),
    ).rows;

    const maxOrder = Number(maxOrderRow?.maxOrder ?? 0);

    trx.executeKysely((q) =>
      q.insertInto("account").values({
        id,
        currency: fields.currency,
        initialBalance: fields.balance,
        balance: fields.balance,
        description: fields.description,
        labelColor: fields.labelColor,
        labelText: fields.labelText,
        order: maxOrder + 1,
        excludeFromDashboard: false,
        createdAt,
        tombstone: false,
      }),
    );
  });

  return id;
}

/**
 * Saves the account details; a changed balance is recorded as an adjustment transaction.
 * `excludeFromDashboard` is left alone when omitted (the web toggles it from the row menu).
 */
export function updateAccount(
  db: UserDbDatabase,
  account: Pick<AccountItem, "id" | "balance">,
  fields: AccountFields & { excludeFromDashboard?: boolean },
) {
  db.executeTransaction((trx) => {
    trx.executeKysely((q) =>
      q
        .updateTable("account")
        .set({
          labelText: fields.labelText,
          labelColor: fields.labelColor,
          currency: fields.currency,
          description: fields.description,
          ...(fields.excludeFromDashboard === undefined ? {} : { excludeFromDashboard: fields.excludeFromDashboard }),
        })
        .where("id", "=", account.id),
    );

    const delta = fields.balance - Number(account.balance);
    if (delta !== 0) {
      createTransactionInTransaction(trx, {
        type: "adjustment",
        accountId: account.id,
        amount: delta,
        effectiveAt: Date.now(),
        title: "Balance adjustment",
      });
    }
  });
}

export function deleteAccount(db: UserDbDatabase, accountId: string) {
  db.executeKysely((q) => q.deleteFrom("account").where("id", "=", accountId));
}

export function setAccountExcludedFromDashboard(db: UserDbDatabase, accountId: string, excluded: boolean) {
  db.executeKysely((q) => q.updateTable("account").set({ excludeFromDashboard: excluded }).where("id", "=", accountId));
}

/**
 * Moves the account at `from` to index `to`; see reorderByOrder. Persist the changes with
 * `saveAccountOrder`.
 */
export const reorderAccounts = reorderByOrder;

export function saveAccountOrder(db: UserDbDatabase, changes: readonly { id: string; order: number }[]) {
  if (changes.length === 1) {
    const [{ id, order }] = changes;
    db.executeKysely((q) => q.updateTable("account").set({ order }).where("id", "=", id));
    return;
  }

  db.executeTransaction((trx) => {
    for (const { id, order } of changes) {
      trx.executeKysely((q) => q.updateTable("account").set({ order }).where("id", "=", id));
    }
  });
}

/**
 * Accounts plus `moveAccount(from, to)`, which inserts the account at `from` at index `to`.
 * Reordering paints from local state until the query catches up, otherwise the row snaps
 * back to its old slot for a frame. Web wires it to dnd-kit, mobile to a drag gesture.
 */
export function useReorderableAccounts() {
  const db = useDb();
  const list = useTimestampedAccounts();

  const [optimisticList, setOptimisticList] = useState(list);
  const accounts = list.timestamp > optimisticList.timestamp ? list.accounts : optimisticList.accounts;

  const moveAccount = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= accounts.length || to >= accounts.length) return;
      const { ordered, changes } = reorderAccounts(accounts, from, to);
      setOptimisticList({ accounts: ordered, timestamp: Date.now() });
      saveAccountOrder(db.db, changes);
    },
    [accounts, db],
  );

  return { accounts, moveAccount };
}
