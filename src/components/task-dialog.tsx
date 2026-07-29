import { generateId } from "@sqlite-sync/core";
import { CalendarClock, CheckIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { localMidnightMs } from "@/lib/date-time";
import { DETACHED_PROVIDER_TYPE, isCalendarBackedTask } from "@/lib/google-calendar/mapping";
import { parseTags, serializeTags } from "@/lib/tags";
import { type DebouncedCallback, useDebounceCallback } from "@/lib/use-debounced-callback";
import { cn } from "@/lib/utils";
import { useDb, useDbQuery } from "@/user-db/user-db";
import { NoteEditor, type NoteEditorHandle } from "./note-editor";
import { TagInput } from "./tag-input";
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
    const id = generateId();
    const createdAt = Date.now();

    db.db.executeTransaction((trx) => {
      const [maxOrderRow] = trx.executeKysely((q) =>
        q
          .selectFrom("item")
          .select((eb) => eb.fn.max("order").as("maxOrder"))
          .where("type", "=", "task"),
      ).rows;

      trx.executeKysely((q) =>
        q.insertInto("item").values({
          id,
          type: "task",
          title: "",
          content: "",
          order: Number(maxOrderRow?.maxOrder ?? 0) + 1,
          createdAt,
          tags: "[]",
          dueAt: null,
          hasDueTime: false,
          completedAt: null,
          tombstone: false,
        }),
      );
    });

    openTaskDialog(id);
  }, [db, openTaskDialog]);
}

type TaskFields = {
  title?: string;
  content?: string;
  tags?: string;
  dueAt?: number | null;
  hasDueTime?: boolean;
  completedAt?: number | null;
};

function TaskDialogContent({
  taskId,
  saveTask,
  onClose,
  onDelete,
  onDetach,
}: {
  taskId: string;
  saveTask: DebouncedCallback<[TaskFields]>;
  onClose: () => void;
  onDelete: () => void;
  onDetach: () => void;
}) {
  const {
    data: [task],
  } = useDbQuery((q) => q.selectFrom("item").selectAll().where("id", "=", taskId));
  const { data: tagSuggestions } = useDbQuery((q) => q.selectFrom("item").select("tags"), {
    mapData: (rows) => {
      const set = new Set<string>();
      for (const row of rows) {
        for (const tag of parseTags(row.tags)) set.add(tag);
      }
      return Array.from(set).sort();
    },
  });

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
    db.db.executeKysely((q) => q.updateTable("item").set(fields).where("id", "=", taskId));
  }, 1000);

  function saveAndClose() {
    saveTask.flush();
    closeDialog();
  }

  function deleteAndClose() {
    saveTask.cancel();
    db.db.executeKysely((q) => q.deleteFrom("item").where("id", "=", taskId));
    closeDialog();
  }

  /**
   * Unlink a mirrored task from its calendar event. `providerId` stays put so the sync job still
   * recognises the event and never re-imports it; the task becomes an ordinary local one.
   */
  function detachFromCalendar() {
    db.db.executeKysely((q) =>
      q.updateTable("item").set({ providerType: DETACHED_PROVIDER_TYPE }).where("id", "=", taskId),
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && saveAndClose()}>
      <DialogContent className="flex flex-col gap-3 overflow-hidden pb-2 sm:max-w-lg sm:pb-2" showCloseButton={false}>
        {taskId ? (
          <TaskDialogContent
            key={openRevision}
            taskId={taskId}
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
