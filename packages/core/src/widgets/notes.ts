import { notesCountQuery, notesListQuery } from "../data/notes";
import { markdownToPreviewText } from "../note-text";
import type { NoteItem } from "../user-db/migrations";
import { readRows, type WidgetDbReader } from "./reader";
import { type NotesWidgetSnapshot, WIDGET_PATHS, WIDGET_SNAPSHOT_VERSION, type WidgetContext } from "./snapshots";

/** More than the largest layout shows (a tall Android widget, titles only). */
export const NOTES_WIDGET_LIMIT = 10;
/** Two lines on the widest layout. */
const PREVIEW_LENGTH = 140;
const UNTITLED_TITLE_LENGTH = 60;

export type NotesWidgetInputs = {
  notes: Pick<NoteItem, "id" | "title" | "content">[];
  total: number;
};

export function readNotesWidgetInputs(db: WidgetDbReader): NotesWidgetInputs {
  const notes = readRows(db, (q) => notesListQuery(q).limit(NOTES_WIDGET_LIMIT));
  const [count] = readRows(db, notesCountQuery);
  return { notes, total: Number(count?.count ?? notes.length) };
}

export function buildNotesWidgetSnapshot(
  { notes, total }: NotesWidgetInputs,
  { now, link }: WidgetContext,
): NotesWidgetSnapshot {
  return {
    v: WIDGET_SNAPSHOT_VERSION,
    kind: "notes",
    state: notes.length === 0 ? "empty" : "ok",
    writtenAt: now,
    links: { open: link(WIDGET_PATHS.open), notes: link(WIDGET_PATHS.notes), newNote: link(WIDGET_PATHS.newNote) },
    notes: notes.slice(0, NOTES_WIDGET_LIMIT).map((note) => {
      const title = note.title.trim();
      const content = note.content ?? "";
      return {
        id: note.id,
        // Like the Notes tab, a note without a title leads with its text.
        title: title || markdownToPreviewText(content, UNTITLED_TITLE_LENGTH) || "Empty note",
        preview: title ? markdownToPreviewText(content, PREVIEW_LENGTH) : "",
        url: link(WIDGET_PATHS.note(note.id)),
      };
    }),
    total: Math.max(total, notes.length),
  };
}
