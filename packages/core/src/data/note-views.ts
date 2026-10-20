import { generateId } from "@sqlite-sync/core";
import { effectiveMatch } from "../note-views";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";

export function useNoteViews() {
  const { data } = useDbQuery((db) =>
    db.selectFrom("note_view").selectAll().orderBy("order", "asc").orderBy("createdAt", "asc"),
  );
  return data;
}

export function createNoteView(
  db: UserDbDatabase,
  view: { name: string; include: string[]; exclude: string[]; match: "all" | "any" },
) {
  const id = generateId();
  const now = Date.now();
  db.executeTransaction((trx) => {
    const [maxOrderRow] = trx.executeKysely((q) =>
      q.selectFrom("note_view").select((eb) => eb.fn.max("order").as("maxOrder")),
    ).rows;
    trx.executeKysely((q) =>
      q.insertInto("note_view").values({
        id,
        tombstone: false,
        name: view.name,
        include: JSON.stringify(view.include),
        exclude: JSON.stringify(view.exclude),
        match: effectiveMatch(view.include, view.match),
        status: null,
        order: Number(maxOrderRow?.maxOrder ?? 0) + 1,
        createdAt: now,
        updatedAt: now,
      }),
    );
  });
  return id;
}

export function deleteNoteView(db: UserDbDatabase, id: string) {
  db.executeKysely((q) => q.deleteFrom("note_view").where("id", "=", id));
}
