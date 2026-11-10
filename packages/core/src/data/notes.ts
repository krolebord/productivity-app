import { type Kysely, type SqlBool, sql } from "kysely";
import { useMemo } from "react";
import { parseTags } from "../tags";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import type { NoteItem, UserDb } from "../user-db/migrations";
import { discardItemIfBlank, isBlankItem, type SaveItemDraftOptions, saveItemDraft } from "./items";

/** Notes as the Notes tab lists them; dated notes belong on the agenda instead. */
const notesQuery = (q: Kysely<UserDb>) => q.selectFrom("item").where("type", "=", "note").where("dueAt", "is", null);

/**
 * How much of each note's body the lists load: more than a card shows on either app. Lists
 * re-read on every write to a note (an open editor saves about once a second), so they take
 * this instead of whole bodies, which can be large.
 */
export const NOTE_PREVIEW_CHARS = 1200;

/** A note as the lists show it: `preview` is the start of its markdown body, never the whole of it. */
export type NoteListItem = Pick<NoteItem, "id" | "title" | "tags" | "order" | "createdAt"> & { preview: string };

/** Every note in the user's manual order (the Notes tab's order). */
export const notesListQuery = (q: Kysely<UserDb>) =>
  notesQuery(q)
    .select(["id", "title", "tags", "order", "createdAt"])
    .select(sql<string>`substr(coalesce(${sql.ref("content")}, ''), 1, ${sql.lit(NOTE_PREVIEW_CHARS)})`.as("preview"))
    .orderBy("order", "asc");

/**
 * A list preview as markdown to render or turn into text. One that was cut short ends at its
 * last whole line, or failing that without the link the cut ran through, so the cut can't
 * leave half a link or list marker behind.
 */
export function notePreviewMarkdown(preview: string): string {
  if (preview.length < NOTE_PREVIEW_CHARS) return preview;
  const lastLineEnd = preview.lastIndexOf("\n");
  if (lastLineEnd > 0) return preview.slice(0, lastLineEnd);
  return preview.replace(/!?\[([^\]]*)\]\([^)]*$/, "$1");
}

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

const NO_ROWS = sql<SqlBool>`0`;

/**
 * Ids of the listed notes whose title or body contains `query`, or null when it is blank.
 * Whole bodies are only loaded while a search is on. They're matched here rather than with
 * LIKE, which ignores case for ASCII letters only.
 */
export function useNoteSearchMatches(query: string): ReadonlySet<string> | null {
  const needle = query.trim().toLowerCase();
  const { data } = useDbQuery((q) =>
    notesQuery(q)
      .select(["id", "title", "content"])
      .$if(!needle, (qb) => qb.where(NO_ROWS)),
  );
  return useMemo(() => {
    if (!needle) return null;
    const ids = new Set<string>();
    for (const note of data) {
      if (note.title.toLowerCase().includes(needle) || (note.content ?? "").toLowerCase().includes(needle)) {
        ids.add(note.id);
      }
    }
    return ids;
  }, [data, needle]);
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

/** A note row's editable fields, as the editors save them. */
export function noteRowFields(note: Pick<NoteItem, "title" | "content" | "tags">): NoteFields {
  return { title: note.title, content: note.content ?? "", tags: note.tags };
}

/** A note with no title or body; tags alone (e.g. prefilled from a filter) don't count. */
export const isBlankNote = isBlankItem;

/** Saves a note editor's fields; see saveItemDraft for how drafts and deleted notes are handled. */
export function saveNote(db: UserDbDatabase, id: string, fields: NoteFields, options?: SaveItemDraftOptions): boolean {
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
