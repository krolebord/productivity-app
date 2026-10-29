import { deleteItem, type ItemFieldsPatch, updateItem, useItem } from "@productivity/core/data/items";
import { createTask, detachTaskFromCalendar, useTaskTagSuggestions } from "@productivity/core/data/tasks";
import { localMidnightMs } from "@productivity/core/date-time";
import { isCalendarBackedTask } from "@productivity/core/google-calendar/mapping";
import { parseTags, serializeTags } from "@productivity/core/tags";
import { type DebouncedCallback, useDebounceCallback } from "@productivity/core/use-debounced-callback";
import { useDb } from "@productivity/core/user-db/db-context";
import { CalendarClock, CheckIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { type RefObject, useCallback, useRef, useState } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
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

export function useCreateTask() {
  const db = useDb();
  const openTaskDialog = useTaskDialogStore((s) => s.open);

  return useCallback(() => {
    const id = createTask(db.db);

    openTaskDialog(id);
  }, [db, openTaskDialog]);
}

type TaskFields = ItemFieldsPatch;

function TaskDialogContent({
  taskId,
  tagInputRef,
  saveTask,
  onClose,
  onDelete,
  onDetach,
}: {
  taskId: string;
  tagInputRef: RefObject<TagInputHandle | null>;
  saveTask: DebouncedCallback<[TaskFields]>;
  onClose: () => void;
  onDelete: () => void;
  onDetach: () => void;
}) {
  const task = useItem(taskId);
  const tagSuggestions = useTaskTagSuggestions();

  const [title, setTitle] = useState(task?.title ?? "");
  const [tags, setTags] = useState<string[]>(() => parseTags(task?.tags));
  const [dueAt, setDueAt] = useState<number | null>(task?.dueAt ?? null);
  const [hasDueTime, setHasDueTime] = useState(task?.hasDueTime ?? false);
  const [completedAt, setCompletedAt] = useState<number | null>(task?.completedAt ?? null);
  const editorRef = useRef<NoteEditorHandle>(null);
  const fieldsRef = useRef({
    title: task?.title ?? "",
    content: task?.content ?? "",
    tags: task?.tags ?? "[]",
    dueAt: task?.dueAt ?? null,
    hasDueTime: task?.hasDueTime ?? false,
    completedAt: task?.completedAt ?? null,
  });

  const updateTask = (fields: TaskFields) => {
    if (fields.title !== undefined) setTitle(fields.title);
    if (fields.completedAt !== undefined) setCompletedAt(fields.completedAt);
    fieldsRef.current = { ...fieldsRef.current, ...fields };
    saveTask({ ...fieldsRef.current });
  };

  const handleScheduleChange = (fields: TaskScheduleFields) => {
    setDueAt(fields.dueAt);
    setHasDueTime(fields.hasDueTime);
    updateTask(fields);
  };

  const deleteConfirm = useInlineConfirm({ onConfirm: onDelete });
  const isNew = !task?.title?.trim() && !task?.content?.trim();

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
          ref={editorRef}
          initialContent={task?.content ?? ""}
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

  const saveTask = useDebounceCallback((fields: TaskFields) => {
    if (taskId) updateItem(db.db, taskId, fields);
  }, 1000);
  const tagInputRef = useRef<TagInputHandle>(null);

  function saveAndClose() {
    tagInputRef.current?.commit();
    saveTask.flush();
    closeDialog();
  }

  function deleteAndClose() {
    saveTask.cancel();
    if (taskId) deleteItem(db.db, taskId);
    closeDialog();
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
            taskId={taskId}
            tagInputRef={tagInputRef}
            saveTask={saveTask}
            onClose={saveAndClose}
            onDelete={deleteAndClose}
            onDetach={detachFromCalendar}
          />
        ) : (
          <DialogTitle>Edit task</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}
