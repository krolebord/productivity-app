import { deleteItem, type ItemFieldsPatch, updateItem, useItem } from "@productivity/core/data/items";
import { convertNoteToTask, createNote, useNoteTagSuggestions } from "@productivity/core/data/notes";
import { parseTags, serializeTags, UNTAGGED } from "@productivity/core/tags";
import { type DebouncedCallback, useDebounceCallback } from "@productivity/core/use-debounced-callback";
import { useDb } from "@productivity/core/user-db/db-context";
import { useMatches } from "@tanstack/react-router";
import { ListTodoIcon, Trash2Icon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { cn } from "@/lib/utils";
import { NoteEditor, type NoteEditorHandle } from "./note-editor";
import { TagInput } from "./tag-input";
import { useTaskDialogStore } from "./task-dialog";
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
    const id = createNote(db.db, { tags: initialTags });

    openNoteDialog(id);
  }, [db, openNoteDialog, initialTags]);
}

type NoteFields = Pick<ItemFieldsPatch, "title" | "content" | "tags">;

function NoteDialogContent({
  noteId,
  saveNote,
  onClose,
  onDelete,
  onConvertToTask,
}: {
  noteId: string;
  saveNote: DebouncedCallback<[NoteFields]>;
  onClose: () => void;
  onDelete: () => void;
  onConvertToTask: () => void;
}) {
  const note = useItem(noteId);
  const tagSuggestions = useNoteTagSuggestions();

  const [title, setTitle] = useState(note?.title ?? "");
  const [tags, setTags] = useState<string[]>(() => parseTags(note?.tags));
  const editorRef = useRef<NoteEditorHandle>(null);
  const fieldsRef = useRef({
    title: note?.title ?? "",
    content: note?.content ?? "",
    tags: note?.tags ?? "[]",
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={onConvertToTask}
        >
          <ListTodoIcon />
          Turn into task
        </Button>
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
  const openTaskDialog = useTaskDialogStore((x) => x.open);

  const saveNote = useDebounceCallback((fields: NoteFields) => {
    if (noteId) updateItem(db.db, noteId, fields);
  }, 1000);

  function saveAndClose() {
    saveNote.flush();
    closeDialog();
  }

  function deleteAndClose() {
    saveNote.cancel();
    if (noteId) deleteItem(db.db, noteId);
    closeDialog();
  }

  function convertToTask() {
    if (!noteId) return;
    saveNote.flush();
    convertNoteToTask(db.db, noteId);
    closeDialog();
    openTaskDialog(noteId);
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
            onConvertToTask={convertToTask}
          />
        ) : (
          <DialogTitle>Edit note</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}
