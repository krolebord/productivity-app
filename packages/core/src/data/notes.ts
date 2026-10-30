import { parseTags } from "../tags";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import { discardItemIfBlank, isBlankItem, saveItemDraft } from "./items";

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
export const isBlankNote = isBlankItem;

/** Saves a note editor's fields; see saveItemDraft for how drafts and deleted notes are handled. */
export function saveNote(
  db: UserDbDatabase,
  id: string,
  fields: NoteFields,
  options?: { draft?: boolean; insertBlank?: boolean },
): boolean {
  return saveItemDraft(db, id, "note", fields, options);
}

/** Deletes the note if it's blank, for editors closing on a note that was opened blank. */
export function discardNoteIfBlank(db: UserDbDatabase, id: string) {
  discardItemIfBlank(db, id, "note");
}

export function convertNoteToTask(db: UserDbDatabase, id: string) {
  db.executeKysely((q) =>
    q.updateTable("item").set({ type: "task", dueAt: null, hasDueTime: false, completedAt: null }).where("id", "=", id),
  );
}
