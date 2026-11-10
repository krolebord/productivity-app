import { deleteItem, isBlankItem, useItem } from "@productivity/core/data/items";
import {
  detachTaskFromCalendar,
  discardTaskIfBlank,
  saveTask,
  type TaskFields,
  taskRowFields,
  useTaskTagSuggestions,
} from "@productivity/core/data/tasks";
import { localMidnightMs } from "@productivity/core/date-time";
import { isCalendarBackedTask } from "@productivity/core/google-calendar/mapping";
import {
  adoptRowChanges,
  createItemEditorSync,
  type ItemEditorSync,
  markItemSaved,
} from "@productivity/core/item-editor-sync";
import { parseTags, serializeTags } from "@productivity/core/tags";
import { type DebouncedCallback, useDebounceCallback } from "@productivity/core/use-debounced-callback";
import { useDb } from "@productivity/core/user-db/db-context";
import { generateId } from "@sqlite-sync/core";
import { CalendarClock, CheckIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { useFlushOnHide } from "@/lib/use-flush-on-hide";
import { cn } from "@/lib/utils";
import { NoteEditor, type NoteEditorHandle } from "./note-editor";
import { TagInput, type TagInputHandle } from "./tag-input";
import { TaskScheduleControl, type TaskScheduleFields } from "./task-schedule";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { useInlineConfirm } from "./ui/inline-confirm";
import { Input } from "./ui/input";

export const useTaskDialogStore = create(
  combine(
    {
      isOpen: false,
      taskId: null as string | null,
      openRevision: 0,
    },
    (set, get) => ({
      open: (id: string) => set({ isOpen: true, taskId: id, openRevision: get().openRevision + 1 }),
      close: () => set({ isOpen: false }),
    }),
  ),
);

/** Opens a new task; like new notes, its row is only inserted once it gets a title or details. */
export function useCreateTask() {
  const openTaskDialog = useTaskDialogStore((s) => s.open);

  return useCallback(() => {
    openTaskDialog(generateId());
  }, [openTaskDialog]);
}

type DraftFlag = { current: boolean };
/** The editor's fields, read when a save runs rather than when it was queued. */
type FieldsRef = { readonly current: TaskFields };

type TaskDialogContentHandle = {
  /** Commits pending tag text and returns the fields to save. */
  commit: () => TaskFields;
  /** Opened as a new or empty task, so closing it while still blank discards it. */
  openedBlank: boolean;
  /** A new task whose row hasn't been inserted yet (see saveItemDraft). */
  draft: DraftFlag;
};

function TaskDialogContent({
  ref,
  taskId,
  queueSave,
  onClose,
  onDelete,
  onDetach,
  onDeletedElsewhere,
}: {
  ref: Ref<TaskDialogContentHandle>;
  taskId: string;
  queueSave: DebouncedCallback<[string, FieldsRef, DraftFlag, ItemEditorSync<TaskFields>]>;
  onClose: () => void;
  onDelete: () => void;
  onDetach: () => void;
  onDeletedElsewhere: () => void;
}) {
  const task = useItem(taskId);
  const tagSuggestions = useTaskTagSuggestions();
  const tagInputRef = useRef<TagInputHandle>(null);
  const [openedBlank] = useState(() => isBlankItem(task ?? {}));
  const draft = useRef(!task);

  const [title, setTitle] = useState(task?.title ?? "");
  const [tags, setTags] = useState<string[]>(() => parseTags(task?.tags));
  const [dueAt, setDueAt] = useState<number | null>(task?.dueAt ?? null);
  const [hasDueTime, setHasDueTime] = useState(Boolean(task?.hasDueTime));
  const [completedAt, setCompletedAt] = useState<number | null>(task?.completedAt ?? null);
  const editorRef = useRef<NoteEditorHandle>(null);
  const fieldsRef = useRef<TaskFields>({
    title: task?.title ?? "",
    content: task?.content ?? "",
    tags: task?.tags ?? "[]",
    dueAt: task?.dueAt ?? null,
    hasDueTime: Boolean(task?.hasDueTime),
    completedAt: task?.completedAt ?? null,
  });
  // What the row is known to hold, so saves write only what changed here (see ItemEditorSync).
  const sync = useRef(createItemEditorSync(task && taskRowFields(task), fieldsRef.current));
  // The editor only reads its content on mount; a new revision remounts it on the row's content.
  const [editorContent, setEditorContent] = useState({ revision: 0, markdown: task?.content ?? "" });

  useImperativeHandle(ref, () => ({
    commit: () => {
      tagInputRef.current?.commit();
      return { ...fieldsRef.current };
    },
    openedBlank,
    draft,
  }));

  // The row disappearing once it was seen means the task was deleted, e.g. on another device.
  // Not `draft`: that clears on the first insert, before the query may have picked the row up.
  const rowSeen = useRef(!!task);
  if (task) rowSeen.current = true;
  const deletedElsewhere = !task && rowSeen.current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to the deletion only.
  useEffect(() => {
    if (deletedElsewhere) onDeletedElsewhere();
  }, [deletedElsewhere]);

  // Fields changed elsewhere (another device, the assistant, calendar sync) that haven't been
  // edited here since the last save are shown; the others keep what was entered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the row changes.
  useEffect(() => {
    if (!task) return;
    const adopted = adoptRowChanges(sync.current, taskRowFields(task), fieldsRef.current);
    if (!adopted) return;
    fieldsRef.current = { ...fieldsRef.current, ...adopted };
    if (adopted.title !== undefined) setTitle(adopted.title);
    if (adopted.tags !== undefined) setTags(parseTags(adopted.tags));
    if (adopted.dueAt !== undefined) setDueAt(adopted.dueAt);
    if (adopted.hasDueTime !== undefined) setHasDueTime(adopted.hasDueTime);
    if (adopted.completedAt !== undefined) setCompletedAt(adopted.completedAt);
    const markdown = adopted.content;
    if (markdown !== undefined) setEditorContent((current) => ({ revision: current.revision + 1, markdown }));
  }, [task]);

  const updateTask = (fields: Partial<TaskFields>) => {
    if (fields.title !== undefined) setTitle(fields.title);
    if (fields.completedAt !== undefined) setCompletedAt(fields.completedAt);
    fieldsRef.current = { ...fieldsRef.current, ...fields };
    queueSave(taskId, fieldsRef, draft, sync.current);
  };

  const handleScheduleChange = (fields: TaskScheduleFields) => {
    setDueAt(fields.dueAt);
    setHasDueTime(fields.hasDueTime);
    updateTask(fields);
  };

  const deleteConfirm = useInlineConfirm({ onConfirm: onDelete });
  const isNew = isBlankItem(task ?? {});

  function toggleCompleted() {
    if (completedAt != null) {
      updateTask({ completedAt: null });
      return;
    }

    const scheduledAt = dueAt ?? localMidnightMs(new Date());
    if (dueAt == null) {
      setDueAt(scheduledAt);
      setHasDueTime(false);
    }
    updateTask({ dueAt: scheduledAt, hasDueTime: dueAt == null ? false : hasDueTime, completedAt: Date.now() });
  }

  return (
    <>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <DialogTitle>{isNew ? "New task" : "Edit task"}</DialogTitle>
        <Input
          placeholder="What needs doing?"
          value={title}
          onChange={(event) => updateTask({ title: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              editorRef.current?.focus();
            }
          }}
          className="rounded-none border-0 border-b bg-transparent! px-0 font-semibold text-base shadow-none focus-visible:border-primary focus-visible:ring-0"
        />
        <NoteEditor
          key={editorContent.revision}
          ref={editorRef}
          initialContent={editorContent.markdown}
          placeholder="Add details..."
          onChange={(content) => updateTask({ content })}
          onEscape={onClose}
        />
        <TagInput
          ref={tagInputRef}
          value={tags}
          onChange={(next) => {
            setTags(next);
            updateTask({ tags: serializeTags(next) });
          }}
          suggestions={tagSuggestions}
          placeholder="Add tags..."
        />
      </div>
      {task && isCalendarBackedTask(task) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
          <CalendarClock className="size-3 shrink-0" />
          <span className="min-w-0">
            Mirrored from Google Calendar — title, time and details are overwritten on sync.
          </span>
          <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onDetach}>
            Unlink
          </Button>
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t pt-2">
        <TaskScheduleControl dueAt={dueAt} hasDueTime={hasDueTime} onChange={handleScheduleChange} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-muted-foreground"
          onClick={toggleCompleted}
        >
          {completedAt == null ? <CheckIcon /> : <RotateCcwIcon />}
          {completedAt == null ? "Complete" : "Reopen"}
        </Button>
        <Button
          type="button"
          variant={deleteConfirm.armed ? "destructive" : "ghost"}
          size="icon-sm"
          className={cn(!deleteConfirm.armed && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
          aria-label={deleteConfirm.armed ? "Confirm delete task" : "Delete task"}
          {...deleteConfirm.getButtonProps()}
        >
          <Trash2Icon />
        </Button>
      </div>
    </>
  );
}

export function TaskDialog() {
  const db = useDb();
  const isOpen = useTaskDialogStore((s) => s.isOpen);
  const taskId = useTaskDialogStore((s) => s.taskId);
  const openRevision = useTaskDialogStore((s) => s.openRevision);
  const closeDialog = useTaskDialogStore((s) => s.close);

  const contentRef = useRef<TaskDialogContentHandle>(null);

  const queueSave = useDebounceCallback(
    (id: string, fieldsRef: FieldsRef, draft: DraftFlag, sync: ItemEditorSync<TaskFields>) => {
      const fields = { ...fieldsRef.current };
      if (saveTask(db.db, id, fields, { draft: draft.current, base: sync.saved })) {
        draft.current = false;
        markItemSaved(sync, fields);
      }
    },
    1000,
  );
  useFlushOnHide(queueSave.flush);

  function saveAndClose() {
    const content = contentRef.current;
    content?.commit();
    queueSave.flush();
    if (taskId && content?.openedBlank) discardTaskIfBlank(db.db, taskId);
    closeDialog();
  }

  function deleteAndClose() {
    queueSave.cancel();
    if (taskId) deleteItem(db.db, taskId);
    closeDialog();
  }

  function closeDeletedTask() {
    // Our own delete (or discarding a blank task) closes the dialog first.
    if (!useTaskDialogStore.getState().isOpen) return;
    queueSave.cancel();
    closeDialog();
    toast.info("This task was deleted elsewhere");
  }

  function detachFromCalendar() {
    if (taskId) detachTaskFromCalendar(db.db, taskId);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && saveAndClose()}>
      <DialogContent className="flex flex-col gap-3 overflow-hidden pb-2 sm:max-w-lg sm:pb-2" showCloseButton={false}>
        {taskId ? (
          <TaskDialogContent
            key={openRevision}
            ref={contentRef}
            taskId={taskId}
            queueSave={queueSave}
            onClose={saveAndClose}
            onDelete={deleteAndClose}
            onDetach={detachFromCalendar}
            onDeletedElsewhere={closeDeletedTask}
          />
        ) : (
          <DialogTitle>Edit task</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}
