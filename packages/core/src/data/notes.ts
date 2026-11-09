import type { Kysely } from "kysely";
import { parseTags } from "../tags";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";
import { discardItemIfBlank, isBlankItem, saveItemDraft } from "./items";

/** Notes as the Notes tab lists them; dated notes belong on the agenda instead. */
const notesQuery = (q: Kysely<UserDb>) => q.selectFrom("item").where("type", "=", "note").where("dueAt", "is", null);

/** Every note in the user's manual order (the Notes tab's order). */
export const notesListQuery = (q: Kysely<UserDb>) => notesQuery(q).selectAll().orderBy("order", "asc");

export const notesCountQuery = (q: Kysely<UserDb>) =>
  notesQuery(q).select((eb) => eb.fn.countAll<number>().as("count"));

export function useNotesList() {
  const { data } = useDbQuery(notesListQuery, {
    mapData: (notes) => ({
      notes: notes,
      timestamp: Date.now(),
    }),
  });
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
