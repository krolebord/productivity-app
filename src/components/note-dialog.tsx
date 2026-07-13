import { generateId } from "@sqlite-sync/core";
import { useMatches } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { parseTags, serializeTags, UNTAGGED } from "@/lib/tags";
import { type DebouncedCallback, useDebounceCallback } from "@/lib/use-debounced-callback";
import { cn } from "@/lib/utils";
import { useDb, useDbQuery } from "@/user-db/user-db";
import { NoteDueDateControl, type NoteDueFields } from "./note-due-date";
import { NoteEditor, type NoteEditorHandle } from "./note-editor";
import { TagInput } from "./tag-input";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { useInlineConfirm } from "./ui/inline-confirm";
import { Input } from "./ui/input";

export const useNoteDialogStore = create(
  combine(
    {
      isOpen: false,
      noteId: null as string | null,
      openRevision: 0,
    },
    (set, get) => ({
      open: (id: string) => set({ isOpen: true, noteId: id, openRevision: get().openRevision + 1 }),
      close: () => set({ isOpen: false }),
    }),
  ),
);

export function useCreateNote() {
  const db = useDb();
  const openNoteDialog = useNoteDialogStore((s) => s.open);

  // When creating from the notes page with a tag filter active, prefill the
  // included tags so the new note appears in the view being looked at (this
  // covers every entry point: page button, hotkey, sidebar, command palette).
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const filterTags =
    lastMatch?.fullPath === "/notes"
      ? ((lastMatch.search as { tags?: string[] }).tags ?? []).filter((tag) => tag !== UNTAGGED)
      : [];
  const initialTags = serializeTags(filterTags);

  return useCallback(() => {
    const id = generateId();
    const createdAt = Date.now();

    db.db.executeTransaction((trx) => {
      const [maxOrderRow] = trx.executeKysely((q) =>
        q
          .selectFrom("item")
          .select((eb) => eb.fn.max("order").as("maxOrder"))
          .where("type", "=", "note"),
      ).rows;

      const maxOrder = Number(maxOrderRow?.maxOrder ?? 0);

      trx.executeKysely((q) =>
        q.insertInto("item").values({
          id,
          type: "note",
          title: "",
          content: "",
          order: maxOrder + 1,
          createdAt,
          tags: initialTags,
          hasDueTime: false,
          tombstone: false,
        }),
      );
    });

    openNoteDialog(id);
  }, [db, openNoteDialog, initialTags]);
}

type NoteFields = {
  title?: string;
  content?: string;
  tags?: string;
  dueAt?: number | null;
  hasDueTime?: boolean;
  completedAt?: number | null;
};

function NoteDialogContent({
  noteId,
  saveNote,
  onClose,
  onDelete,
}: {
  noteId: string;
  saveNote: DebouncedCallback<[NoteFields]>;
  onClose: () => void;
  onDelete: () => void;
}) {
  const {
    data: [note],
  } = useDbQuery((q) => q.selectFrom("item").selectAll().where("id", "=", noteId));

  // Distinct tags across all notes, for autocomplete.
  const { data: tagSuggestions } = useDbQuery((q) => q.selectFrom("item").select(["tags"]).where("type", "=", "note"), {
    mapData: (rows) => {
      const set = new Set<string>();
      for (const row of rows) {
        for (const tag of parseTags(row.tags)) set.add(tag);
      }
      return Array.from(set).sort();
    },
  });

  const [title, setTitle] = useState(note?.title ?? "");
  const [tags, setTags] = useState<string[]>(() => parseTags(note?.tags));
  const [dueAt, setDueAt] = useState<number | null>(note?.dueAt ?? null);
  const [hasDueTime, setHasDueTime] = useState(note?.hasDueTime ?? false);
  const editorRef = useRef<NoteEditorHandle>(null);
  // Latest values live in a ref so every save carries all fields,
  // regardless of which input triggered it.
  const fieldsRef = useRef({
    title: note?.title ?? "",
    content: note?.content ?? "",
    tags: note?.tags ?? "[]",
    dueAt: note?.dueAt ?? null,
    hasDueTime: note?.hasDueTime ?? false,
    completedAt: note?.completedAt ?? null,
  });

  const updateNote = (fields: NoteFields) => {
    if (fields.title !== undefined) setTitle(fields.title);
    fieldsRef.current = { ...fieldsRef.current, ...fields };
    saveNote({ ...fieldsRef.current });
  };

  const handleTagsChange = (next: string[]) => {
    setTags(next);
    updateNote({ tags: serializeTags(next) });
  };

  const handleDueChange = (fields: NoteDueFields) => {
    setDueAt(fields.dueAt);
    setHasDueTime(fields.hasDueTime);
    updateNote(fields);
  };

  const deleteConfirm = useInlineConfirm({ onConfirm: onDelete });

  const isNew = !note?.title?.trim() && !note?.content?.trim();

  return (
    <>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <DialogTitle>{isNew ? "New note" : "Edit note"}</DialogTitle>
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => {
            updateNote({ title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editorRef.current?.focus();
            }
          }}
          className="rounded-none border-0 border-b bg-transparent! px-0 font-semibold text-base shadow-none focus-visible:border-primary focus-visible:ring-0"
        />
        <TagInput value={tags} onChange={handleTagsChange} suggestions={tagSuggestions} placeholder="Add tags..." />
        <NoteEditor
          ref={editorRef}
          initialContent={note?.content ?? ""}
          placeholder="Take a note..."
          onChange={(markdown) => {
            updateNote({ content: markdown });
          }}
          onEscape={onClose}
        />
      </div>
      <div className="flex shrink-0 items-center justify-between border-t pt-2">
        <NoteDueDateControl dueAt={dueAt} hasDueTime={hasDueTime} onChange={handleDueChange} />
        <Button
          type="button"
          variant={deleteConfirm.armed ? "destructive" : "ghost"}
          size="icon-sm"
          className={cn(
            "md:hidden",
            !deleteConfirm.armed && "text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
          aria-label={deleteConfirm.armed ? "Confirm delete note" : "Delete note"}
          {...deleteConfirm.getButtonProps()}
        >
          <Trash2Icon />
        </Button>
      </div>
    </>
  );
}

export function NoteDialog() {
  const db = useDb();
  const isOpen = useNoteDialogStore((x) => x.isOpen);
  const noteId = useNoteDialogStore((x) => x.noteId);
  const openRevision = useNoteDialogStore((x) => x.openRevision);
  const closeDialog = useNoteDialogStore((x) => x.close);

  const saveNote = useDebounceCallback((fields: NoteFields) => {
    db.db.executeKysely((q) => q.updateTable("item").set(fields).where("id", "=", noteId));
  }, 1000);

  function saveAndClose() {
    saveNote.flush();
    closeDialog();
  }

  function deleteAndClose() {
    saveNote.cancel();
    db.db.executeKysely((q) => q.deleteFrom("item").where("id", "=", noteId));
    closeDialog();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && saveAndClose()}>
      <DialogContent className="flex flex-col gap-3 overflow-hidden pb-2 sm:max-w-lg sm:pb-2" showCloseButton={false}>
        {noteId ? (
          <NoteDialogContent
            key={openRevision}
            noteId={noteId}
            saveNote={saveNote}
            onClose={saveAndClose}
            onDelete={deleteAndClose}
          />
        ) : (
          <DialogTitle>Edit note</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}
