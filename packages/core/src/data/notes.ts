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

export type NoteFields = { title: string; content: string; tags: string };

/** A note with no title or body; tags alone (e.g. prefilled from a filter) don't count. */
export const isBlankNote = (note: { title?: string | null; content?: string | null }) =>
  !note.title?.trim() && !note.content?.trim();

/**
 * Saves a note editor's fields and returns whether the note's row exists afterwards.
 * "New note" opens an editor on a fresh id without a row (`draft`), and the row is only
 * inserted once the note gets a title or body, so an abandoned new note never reaches
 * the database (or syncs to other devices). `insertBlank` inserts a draft regardless,
 * for actions that need the row (Make task). Outside a draft a missing row means the
 * note was deleted, e.g. on another device, and saving doesn't bring it back; editors
 * stop passing `draft` once this returns true.
 */
export function saveNote(
  db: UserDbDatabase,
  id: string,
  fields: NoteFields,
  { draft = false, insertBlank = false }: { draft?: boolean; insertBlank?: boolean } = {},
): boolean {
  return db.executeTransaction((trx) => {
    const [existing] = trx.executeKysely((q) => q.selectFrom("item").select("id").where("id", "=", id)).rows;
    if (existing) {
      trx.executeKysely((q) => q.updateTable("item").set(fields).where("id", "=", id));
      return true;
    }
    if (!draft || (!insertBlank && isBlankNote(fields))) return false;

    const order = nextItemOrder(trx, "note");
    trx.executeKysely((q) =>
      q.insertInto("item").values({
        id,
        type: "note",
        ...fields,
        order,
        createdAt: Date.now(),
        hasDueTime: false,
        tombstone: false,
      }),
    );
    return true;
  });
}

/** Deletes the note if it's blank, for editors closing on a note that was opened blank. */
export function discardNoteIfBlank(db: UserDbDatabase, id: string) {
  db.executeTransaction((trx) => {
    const [note] = trx.executeKysely((q) =>
      q.selectFrom("item").select(["title", "content"]).where("id", "=", id).where("type", "=", "note"),
    ).rows;
    if (note && isBlankNote(note)) trx.executeKysely((q) => q.deleteFrom("item").where("id", "=", id));
  });
}

export function convertNoteToTask(db: UserDbDatabase, id: string) {
  db.executeKysely((q) =>
    q.updateTable("item").set({ type: "task", dueAt: null, hasDueTime: false, completedAt: null }).where("id", "=", id),
  );
}
