import type { SyncedDbTransaction } from "@sqlite-sync/core";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import type { NoteItem, UserDb } from "../user-db/migrations";

export type ItemFieldsPatch = {
  title?: string;
  content?: string;
  tags?: string;
  dueAt?: number | null;
  hasDueTime?: boolean;
  completedAt?: number | null;
};

export function useItem(id: string) {
  const {
    data: [item],
  } = useDbQuery((q) => q.selectFrom("item").selectAll().where("id", "=", id));
  return item;
}

export function nextItemOrder(trx: Pick<SyncedDbTransaction<UserDb>, "executeKysely">, type: NoteItem["type"]) {
  const [maxOrderRow] = trx.executeKysely((q) =>
    q
      .selectFrom("item")
      .select((eb) => eb.fn.max("order").as("maxOrder"))
      .where("type", "=", type),
  ).rows;
  return Number(maxOrderRow?.maxOrder ?? 0) + 1;
}

export function updateItem(db: UserDbDatabase, id: string, fields: ItemFieldsPatch) {
  db.executeKysely((q) => q.updateTable("item").set(fields).where("id", "=", id));
}

export function deleteItem(db: UserDbDatabase, id: string) {
  db.executeKysely((q) => q.deleteFrom("item").where("id", "=", id));
}

export function setItemOrder(db: UserDbDatabase, id: string, order: number) {
  db.executeKysely((q) => q.updateTable("item").set({ order }).where("id", "=", id));
}

/** Renumbers the given items 1..n in list order. */
export function reorderItems(db: UserDbDatabase, orderedIds: readonly string[]) {
  db.executeTransaction((trx) => {
    orderedIds.forEach((id, i) => {
      trx.executeKysely((q) =>
        q
          .updateTable("item")
          .set({ order: i + 1 })
          .where("id", "=", id),
      );
    });
  });
}
