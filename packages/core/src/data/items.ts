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

/** An item with no title or body; tags or a schedule alone don't count. */
export const isBlankItem = (item: { title?: string | null; content?: string | null }) =>
  !item.title?.trim() && !item.content?.trim();

/**
 * Saves an editor's fields for a note or task and returns whether its row exists afterwards.
 * "New note"/"New task" opens an editor on a fresh id without a row (`draft`), and the row is
 * only inserted once the item gets a title or body, so an abandoned new item never reaches
 * the database (or syncs to other devices). `insertBlank` inserts a draft regardless, for
 * actions that need the row (Make task, Ask assistant). Outside a draft a missing row means
 * the item was deleted, e.g. on another device, and saving doesn't bring it back; editors
 * stop passing `draft` once this returns true.
 */
export function saveItemDraft(
  db: UserDbDatabase,
  id: string,
  type: NoteItem["type"],
  fields: ItemFieldsPatch & { title: string; tags: string },
  { draft = false, insertBlank = false }: { draft?: boolean; insertBlank?: boolean } = {},
): boolean {
  return db.executeTransaction((trx) => {
    const [existing] = trx.executeKysely((q) => q.selectFrom("item").select("id").where("id", "=", id)).rows;
    if (existing) {
      trx.executeKysely((q) => q.updateTable("item").set(fields).where("id", "=", id));
      return true;
    }
    if (!draft || (!insertBlank && isBlankItem(fields))) return false;

    const order = nextItemOrder(trx, type);
    trx.executeKysely((q) =>
      q.insertInto("item").values({
        hasDueTime: false,
        ...fields,
        id,
        type,
        order,
        createdAt: Date.now(),
        tombstone: false,
      }),
    );
    return true;
  });
}

/** Deletes the item if it's blank and of `type`, for editors closing on an item opened blank. */
export function discardItemIfBlank(db: UserDbDatabase, id: string, type: NoteItem["type"]) {
  db.executeTransaction((trx) => {
    const [item] = trx.executeKysely((q) =>
      q.selectFrom("item").select(["title", "content"]).where("id", "=", id).where("type", "=", type),
    ).rows;
    if (item && isBlankItem(item)) trx.executeKysely((q) => q.deleteFrom("item").where("id", "=", id));
  });
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

export function saveItemOrder(db: UserDbDatabase, changes: readonly { id: string; order: number }[]) {
  db.executeTransaction((trx) => {
    for (const { id, order } of changes) {
      trx.executeKysely((q) => q.updateTable("item").set({ order }).where("id", "=", id));
    }
  });
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
