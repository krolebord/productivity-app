import { generateId } from "@sqlite-sync/core";
import { useCallback, useRef, useState } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { type DebouncedCallback, useDebounceCallback } from "@/lib/use-debounced-callback";
import { useDb, useDbQuery } from "@/user-db/user-db";
import { NoteEditor, type NoteEditorHandle } from "./note-editor";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
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
          tombstone: false,
        }),
      );
    });

    openNoteDialog(id);
  }, [db, openNoteDialog]);
}

function NoteDialogContent({
  noteId,
  saveNote,
  onClose,
}: {
  noteId: string;
  saveNote: DebouncedCallback<[{ title?: string; content?: string }]>;
  onClose: () => void;
}) {
  const {
    data: [note],
  } = useDbQuery((q) => q.selectFrom("item").selectAll().where("id", "=", noteId));

  const [title, setTitle] = useState(note?.title ?? "");
  const editorRef = useRef<NoteEditorHandle>(null);
  // Latest values live in a ref so every save carries both fields,
  // regardless of which input triggered it.
  const fieldsRef = useRef({ title: note?.title ?? "", content: note?.content ?? "" });

  const updateNote = (fields: { title?: string; content?: string }) => {
    if (fields.title !== undefined) setTitle(fields.title);
    fieldsRef.current = { ...fieldsRef.current, ...fields };
    saveNote({ ...fieldsRef.current });
  };

  return (
    <>
      <DialogTitle className="sr-only">Edit note</DialogTitle>
      <div className="flex flex-col gap-3">
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
    </>
  );
}

export function NoteDialog() {
  const db = useDb();
  const isOpen = useNoteDialogStore((x) => x.isOpen);
  const noteId = useNoteDialogStore((x) => x.noteId);
  const openRevision = useNoteDialogStore((x) => x.openRevision);
  const closeDialog = useNoteDialogStore((x) => x.close);

  const saveNote = useDebounceCallback((fields: { title?: string; content?: string }) => {
    db.db.executeKysely((q) => q.updateTable("item").set(fields).where("id", "=", noteId));
  }, 1000);

  function saveAndClose() {
    saveNote.flush();
    closeDialog();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && saveAndClose()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        {noteId && <NoteDialogContent key={openRevision} noteId={noteId} saveNote={saveNote} onClose={saveAndClose} />}
      </DialogContent>
    </Dialog>
  );
}
