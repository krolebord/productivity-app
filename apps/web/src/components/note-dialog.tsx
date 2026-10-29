import { deleteItem, useItem } from "@productivity/core/data/items";
import {
  convertNoteToTask,
  discardNoteIfBlank,
  isBlankNote,
  type NoteFields,
  saveNote,
  useNoteTagSuggestions,
} from "@productivity/core/data/notes";
import { parseTags, serializeTags, UNTAGGED } from "@productivity/core/tags";
import { type DebouncedCallback, useDebounceCallback } from "@productivity/core/use-debounced-callback";
import { useDb } from "@productivity/core/user-db/db-context";
import { generateId } from "@sqlite-sync/core";
import { useMatches } from "@tanstack/react-router";
import { ListTodoIcon, Trash2Icon } from "lucide-react";
import { type Ref, useCallback, useImperativeHandle, useRef, useState } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { cn } from "@/lib/utils";
import { NoteEditor, type NoteEditorHandle } from "./note-editor";
import { TagInput, type TagInputHandle } from "./tag-input";
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
      /** Tags for a new note, whose row doesn't exist until it gets content (see saveNote). */
      draftTags: null as string | null,
      openRevision: 0,
    },
    (set, get) => ({
      open: (id: string, draftTags: string | null = null) =>
        set({ isOpen: true, noteId: id, draftTags, openRevision: get().openRevision + 1 }),
      close: () => set({ isOpen: false }),
    }),
  ),
);

export function useCreateNote() {
  const openNoteDialog = useNoteDialogStore((s) => s.open);

  // When creating from the notes page with a tag filter active, prefill the
  // included tags so the new note appears in the view being looked at (this
  // covers every entry point: page button, hotkey, sidebar, command palette).
  // Nothing is inserted until the note gets content, so abandoned new notes don't pile up.
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const filterTags =
    lastMatch?.fullPath === "/notes"
      ? ((lastMatch.search as { tags?: string[] }).tags ?? []).filter((tag) => tag !== UNTAGGED)
      : [];
  const initialTags = serializeTags(filterTags);

  return useCallback(() => {
    openNoteDialog(generateId(), initialTags);
  }, [openNoteDialog, initialTags]);
}

type DraftFlag = { current: boolean };

type NoteDialogContentHandle = {
  /** Commits pending tag text and returns the fields to save. */
  commit: () => NoteFields;
  /** Opened as a new or empty note, so closing it while still blank discards it. */
  openedBlank: boolean;
  /**
   * A new note whose row hasn't been inserted yet. After the first insert, or for a note
   * opened from its row, a missing row means it was deleted elsewhere and isn't recreated.
   */
  draft: DraftFlag;
};

function NoteDialogContent({
  ref,
  noteId,
  draftTags,
  queueSave,
  onClose,
  onDelete,
  onConvertToTask,
}: {
  ref: Ref<NoteDialogContentHandle>;
  noteId: string;
  draftTags: string | null;
  queueSave: DebouncedCallback<[string, NoteFields, DraftFlag]>;
  onClose: () => void;
  onDelete: () => void;
  onConvertToTask: () => void;
}) {
  const note = useItem(noteId);
  const tagSuggestions = useNoteTagSuggestions();

  const [title, setTitle] = useState(note?.title ?? "");
  const [tags, setTags] = useState<string[]>(() => parseTags(note?.tags ?? draftTags));
  const [openedBlank] = useState(() => isBlankNote(note ?? {}));
  const draft = useRef(!note);
  const editorRef = useRef<NoteEditorHandle>(null);
  const tagInputRef = useRef<TagInputHandle>(null);
  const fieldsRef = useRef<NoteFields>({
    title: note?.title ?? "",
    content: note?.content ?? "",
    tags: note?.tags ?? draftTags ?? "[]",
  });

  const updateNote = (fields: Partial<NoteFields>) => {
    if (fields.title !== undefined) setTitle(fields.title);
    fieldsRef.current = { ...fieldsRef.current, ...fields };
    queueSave(noteId, { ...fieldsRef.current }, draft);
  };

  useImperativeHandle(ref, () => ({
    commit: () => {
      tagInputRef.current?.commit();
      return { ...fieldsRef.current };
    },
    openedBlank,
    draft,
  }));

  const handleTagsChange = (next: string[]) => {
    setTags(next);
    updateNote({ tags: serializeTags(next) });
  };

  const deleteConfirm = useInlineConfirm({ onConfirm: onDelete });

  const isNew = isBlankNote(note ?? {});

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
        <TagInput
          ref={tagInputRef}
          value={tags}
          onChange={handleTagsChange}
          suggestions={tagSuggestions}
          placeholder="Add tags..."
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
  const draftTags = useNoteDialogStore((x) => x.draftTags);
  const openRevision = useNoteDialogStore((x) => x.openRevision);
  const closeDialog = useNoteDialogStore((x) => x.close);
  const openTaskDialog = useTaskDialogStore((x) => x.open);

  const contentRef = useRef<NoteDialogContentHandle>(null);

  const queueSave = useDebounceCallback((id: string, fields: NoteFields, draft: DraftFlag) => {
    if (saveNote(db.db, id, fields, { draft: draft.current })) draft.current = false;
  }, 1000);

  function saveAndClose() {
    const content = contentRef.current;
    content?.commit();
    queueSave.flush();
    if (noteId && content?.openedBlank) discardNoteIfBlank(db.db, noteId);
    closeDialog();
  }

  function deleteAndClose() {
    queueSave.cancel();
    if (noteId) deleteItem(db.db, noteId);
    closeDialog();
  }

  function convertToTask() {
    const content = contentRef.current;
    const fields = content?.commit();
    if (!noteId || !content || !fields) return;
    queueSave.cancel();
    if (saveNote(db.db, noteId, fields, { draft: content.draft.current, insertBlank: true }))
      content.draft.current = false;
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
            ref={contentRef}
            noteId={noteId}
            draftTags={draftTags}
            queueSave={queueSave}
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
