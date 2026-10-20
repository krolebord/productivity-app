import { generateId } from "@sqlite-sync/core";
import { parseTags } from "../tags";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import { nextItemOrder } from "./items";

export function useNotesList() {
  const { data } = useDbQuery(
    (db) =>
      db.selectFrom("item").selectAll().where("type", "=", "note").where("dueAt", "is", null).orderBy("order", "asc"),
    {
      mapData: (notes) => ({
        notes: notes,
        timestamp: Date.now(),
      }),
    },
  );
  return data;
}

export function useNoteTagSuggestions() {
  const { data } = useDbQuery((q) => q.selectFrom("item").select(["tags"]).where("type", "=", "note"), {
    mapData: (rows) => {
      const set = new Set<string>();
      for (const row of rows) {
        for (const tag of parseTags(row.tags)) set.add(tag);
      }
      return Array.from(set).sort();
    },
  });
  return data;
}

export function createNote(db: UserDbDatabase, { tags }: { tags: string }) {
  const id = generateId();
  const createdAt = Date.now();

  db.executeTransaction((trx) => {
    const order = nextItemOrder(trx, "note");

    trx.executeKysely((q) =>
      q.insertInto("item").values({
        id,
        type: "note",
        title: "",
        content: "",
        order,
        createdAt,
        tags,
        hasDueTime: false,
        tombstone: false,
      }),
    );
  });

  return id;
}

export function convertNoteToTask(db: UserDbDatabase, id: string) {
  db.executeKysely((q) =>
    q.updateTable("item").set({ type: "task", dueAt: null, hasDueTime: false, completedAt: null }).where("id", "=", id),
  );
}
