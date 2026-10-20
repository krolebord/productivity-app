import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  type AgendaHabit,
  type AgendaHabitRow,
  type AgendaRow,
  type AgendaSection,
  type AgendaTask,
  type AgendaTaskRow,
  type DayHabitProgress,
  parseDateKey,
} from "@productivity/core/agenda";
import { formatDueDateLabel } from "@productivity/core/date-time";
import { isCalendarBackedTask } from "@productivity/core/google-calendar/mapping";
import { format } from "date-fns";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVerticalIcon,
  InboxIcon,
  ListTodoIcon,
  PlusIcon,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useActiveDrag } from "@/components/app-dnd";
import { noteContentToPlainText } from "@/components/note-extensions";
import { useTaskDialogStore } from "@/components/task-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { dayDropId, INBOX_DROP_ID } from "@/lib/app-dnd";
import { cn } from "@/lib/utils";
import { type CalendarDayInfo, useAgenda } from "./use-agenda";
import { useTaskReorder } from "./use-task-reorder";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export function TodayView() {
  const agenda = useAgenda();
  const openTaskDialog = useTaskDialogStore((s) => s.open);

  const headerLabel = agenda.isSelectedToday ? "Today" : format(agenda.selectedDate, "EEE, MMM d");
  const activeSections = useMemo(
    () =>
      agenda.sections.reduce<AgendaSection[]>((result, section) => {
        const rows = section.rows.filter((row) => (row.kind === "task" ? !row.completed : !row.done));
        if (rows.length > 0) result.push({ ...section, rows });
        return result;
      }, []),
    [agenda.sections],
  );
  const completedRows = useMemo(
    () =>
      agenda.sections.flatMap((section) =>
        section.rows.filter((row) => (row.kind === "task" ? row.completed : row.done)),
      ),
    [agenda.sections],
  );

  const { displayedInboxTasks, displayedSections } = useTaskReorder(agenda.inboxTasks, activeSections);

  // Drag affordances reuse UI that is already on screen — the calendar cells and
  // the inbox header — so nothing mounts mid-drag and the agenda never reflows.
  const activeDrag = useActiveDrag();
  const draggedId = activeDrag && (activeDrag.kind === "task" || activeDrag.kind === "note") ? activeDrag.id : null;
  const draggedFromInbox = draggedId != null && agenda.inboxTasks.some((task) => task.id === draggedId);
  const inboxDropActive = draggedId != null && !draggedFromInbox;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate font-semibold text-xl">{headerLabel}</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={agenda.goToToday}
          aria-hidden={agenda.isSelectedToday}
          tabIndex={agenda.isSelectedToday ? -1 : undefined}
          className={cn(agenda.isSelectedToday && "invisible")}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={agenda.calendarExpanded ? "Collapse calendar" : "Expand calendar"}
          aria-expanded={agenda.calendarExpanded}
          onClick={agenda.toggleCalendarExpanded}
          className="text-muted-foreground"
        >
          {agenda.calendarExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </div>

      <CalendarStrip
        days={agenda.dayInfos}
        expanded={agenda.calendarExpanded}
        selectedDate={agenda.selectedDate}
        selectedKey={agenda.selectedKey}
        todayKey={agenda.todayKey}
        dragActive={draggedId != null}
        onSelect={agenda.selectDateKey}
        onShift={agenda.shiftCalendar}
      />

      <QuickAddTask
        selectedLabel={headerLabel}
        onCreate={(title, sendToInbox) => agenda.createTask(title, !sendToInbox)}
      />

      {displayedInboxTasks.length > 0 && (
        <InboxSection
          tasks={displayedInboxTasks}
          selectedLabel={headerLabel}
          dropActive={inboxDropActive}
          onOpen={openTaskDialog}
          onToggle={agenda.completeInboxTask}
          onSchedule={agenda.scheduleInboxTask}
        />
      )}

      {displayedSections.length === 0 && completedRows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-5">
          {displayedSections.map((section) => (
            <AgendaSectionBlock
              key={section.bucket}
              section={section}
              onOpenTask={openTaskDialog}
              onToggleTask={agenda.toggleTaskCompleted}
              onMoveTaskToToday={agenda.moveTaskToToday}
              onToggleHabit={agenda.toggleHabitDone}
              onIncrementHabit={agenda.incrementHabit}
            />
          ))}
          {completedRows.length > 0 && (
            <CompletedSection
              rows={completedRows}
              onOpenTask={openTaskDialog}
              onToggleTask={agenda.toggleTaskCompleted}
              onToggleHabit={agenda.toggleHabitDone}
              onIncrementHabit={agenda.incrementHabit}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CalendarStrip({
  days,
  expanded,
  selectedDate,
  selectedKey,
  todayKey,
  dragActive,
  onSelect,
  onShift,
}: {
  days: CalendarDayInfo[];
  expanded: boolean;
  selectedDate: Date;
  selectedKey: string;
  todayKey: string;
  dragActive: boolean;
  onSelect: (dateKey: string) => void;
  onShift: (delta: number) => void;
}) {
  const shiftButton = (delta: number) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 text-muted-foreground"
      aria-label={delta < 0 ? (expanded ? "Previous month" : "Previous week") : expanded ? "Next month" : "Next week"}
      onClick={() => onShift(delta)}
    >
      {delta < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </Button>
  );

  if (!expanded) {
    return (
      <div className="flex items-center gap-0.5">
        {shiftButton(-1)}
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
          {days.map((day, index) => (
            <DayCell
              key={day.dateKey}
              day={day}
              initial={WEEKDAY_INITIALS[index]}
              selected={day.dateKey === selectedKey}
              isToday={day.dateKey === todayKey}
              dragActive={dragActive}
              onSelect={onSelect}
            />
          ))}
        </div>
        {shiftButton(1)}
      </div>
    );
  }

  const selectedMonth = selectedDate.getMonth();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        {shiftButton(-1)}
        <span className="font-medium text-sm">{format(selectedDate, "MMMM yyyy")}</span>
        {shiftButton(1)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span
            key={index}
            aria-hidden
            className="text-center font-medium text-[10px] text-muted-foreground uppercase leading-none"
          >
            {initial}
          </span>
        ))}
        {days.map((day) => (
          <DayCell
            key={day.dateKey}
            day={day}
            selected={day.dateKey === selectedKey}
            isToday={day.dateKey === todayKey}
            muted={day.date.getMonth() !== selectedMonth}
            dragActive={dragActive}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  initial,
  selected,
  isToday,
  muted = false,
  dragActive = false,
  onSelect,
}: {
  day: CalendarDayInfo;
  initial?: string;
  selected: boolean;
  isToday: boolean;
  muted?: boolean;
  dragActive?: boolean;
  onSelect: (dateKey: string) => void;
}) {
  const droppable = useDroppable({ id: dayDropId(day.dateKey) });

  return (
    <button
      ref={droppable.setNodeRef}
      type="button"
      onClick={() => onSelect(day.dateKey)}
      aria-label={format(day.date, "EEEE, MMMM d")}
      aria-current={isToday ? "date" : undefined}
      aria-pressed={selected}
      className={cn(
        // Not `transition-colors`: that includes outline-color in Tailwind v4, which
        // would fade the drag outline in from `currentcolor` instead of showing it flat.
        "relative flex flex-col items-center gap-px rounded-md py-1 transition-[color,background-color]",
        selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        !selected && isToday && "text-foreground",
        muted && !selected && "opacity-40",
        // Outlines and rings sit outside the box model, so drag affordances never reflow the strip.
        dragActive && !droppable.isOver && "outline-dashed outline-1 outline-border",
        dragActive && muted && "opacity-70",
        droppable.isOver && "opacity-100 ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
    >
      {initial && <span className="font-medium text-[10px] uppercase leading-none">{initial}</span>}
      <span className="relative flex size-6 items-center justify-center">
        {day.habitProgress && (
          <HabitProgressRing progress={day.habitProgress} selected={selected} className="absolute inset-0" />
        )}
        <span
          className={cn(
            "relative z-10 font-semibold text-sm tabular-nums leading-none",
            selected && "text-primary-foreground",
            !selected && isToday && "text-primary",
          )}
        >
          {day.date.getDate()}
        </span>
      </span>
      <span
        className={cn(
          "size-1 rounded-full",
          day.hasIncompleteTasks ? (selected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
        )}
      />
    </button>
  );
}

function HabitProgressRing({
  progress,
  selected,
  className,
}: {
  progress: DayHabitProgress;
  selected: boolean;
  className?: string;
}) {
  const ratio = progress.due > 0 ? Math.min(1, progress.done / progress.due) : 0;
  const pct = Math.round(ratio * 100);
  const track = selected
    ? "color-mix(in oklab, var(--primary-foreground) 30%, transparent)"
    : "color-mix(in oklab, var(--muted-foreground) 25%, transparent)";
  const fill = selected ? "var(--primary-foreground)" : "var(--primary)";

  return (
    <span
      aria-hidden
      className={cn("rounded-full", className)}
      style={{
        background: `conic-gradient(${fill} ${pct}%, ${track} 0)`,
        mask: "radial-gradient(farthest-side, transparent calc(100% - 1.75px), #000 calc(100% - 1.75px))",
        WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 1.75px), #000 calc(100% - 1.75px))",
      }}
    />
  );
}

function QuickAddTask({
  selectedLabel,
  onCreate,
}: {
  selectedLabel: string;
  onCreate: (title: string, sendToInbox: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [sendToInbox, setSendToInbox] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate(title, sendToInbox);
    setTitle("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-xs">
      <ListTodoIcon className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add a task..."
        aria-label="Task title"
        className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 gap-1 px-2 text-muted-foreground text-xs"
        onClick={() => setSendToInbox((value) => !value)}
        aria-label={sendToInbox ? "Send new task to Inbox" : `Schedule new task for ${selectedLabel}`}
        title="Change task destination"
      >
        {sendToInbox ? <InboxIcon className="size-3.5" /> : <CalendarDays className="size-3.5" />}
        <span className="hidden sm:inline">{sendToInbox ? "Inbox" : selectedLabel}</span>
      </Button>
      <Button type="submit" size="icon-sm" disabled={!title.trim()} aria-label="Add task">
        <PlusIcon className="size-4" />
      </Button>
    </form>
  );
}

function InboxSection({
  tasks,
  selectedLabel,
  dropActive,
  onOpen,
  onToggle,
  onSchedule,
}: {
  tasks: AgendaTask[];
  selectedLabel: string;
  dropActive: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onSchedule: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Disabled outside a drag so it never shadows the inbox rows' own reorder targets.
  const droppable = useDroppable({ id: INBOX_DROP_ID, disabled: !dropActive });
  const isOver = dropActive && droppable.isOver;

  return (
    <section
      ref={droppable.setNodeRef}
      className={cn(
        "rounded-lg border border-dashed bg-muted/20 transition-colors",
        dropActive && "border-primary/40",
        isOver && "border-primary bg-primary/10 ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <InboxIcon className={cn("size-4 text-muted-foreground", isOver && "text-primary")} />
        <span className="font-medium text-sm">Inbox</span>
        <span className="text-muted-foreground text-xs tabular-nums">{tasks.length}</span>
        <span className={cn("ml-auto text-xs", isOver ? "font-medium text-primary" : "text-muted-foreground")}>
          {dropActive ? "Drop to unschedule" : "Not scheduled"}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
      </button>
      {expanded && (
        <ul className="border-t px-1.5 py-1">
          {tasks.map((task) => (
            <li key={task.id}>
              <InboxTaskRow
                task={task}
                selectedLabel={selectedLabel}
                onOpen={() => onOpen(task.id)}
                onToggle={(completed) => onToggle(task.id, completed)}
                onSchedule={() => onSchedule(task.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskDragHandle({
  draggable,
  label,
  reorderable,
}: {
  draggable: ReturnType<typeof useDraggable>;
  label: string;
  reorderable: boolean;
}) {
  return (
    <button
      ref={draggable.setActivatorNodeRef}
      type="button"
      className="-mr-1 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 opacity-100 hover:bg-muted hover:text-foreground active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      aria-label={reorderable ? `Drag ${label} to reorder or reschedule` : `Drag ${label} to another date`}
      title={reorderable ? "Drag to reorder or reschedule" : "Drag to reschedule"}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      <GripVerticalIcon className="size-3.5" />
    </button>
  );
}

function InboxTaskRow({
  task,
  selectedLabel,
  onOpen,
  onToggle,
  onSchedule,
}: {
  task: AgendaTask;
  selectedLabel: string;
  onOpen: () => void;
  onToggle: (completed: boolean) => void;
  onSchedule: () => void;
}) {
  const draggable = useDraggable({ id: task.id, data: { kind: "task" } });
  const droppable = useDroppable({ id: task.id });
  const label = task.title.trim() || noteContentToPlainText(task.content, 100) || "Untitled";

  return (
    <div
      ref={(el) => {
        draggable.setNodeRef(el);
        droppable.setNodeRef(el);
      }}
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      className={cn(
        "group relative flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60",
        draggable.isDragging && "z-20 bg-card opacity-90 shadow-md",
      )}
    >
      <Checkbox
        checked={false}
        onCheckedChange={(value) => onToggle(value === true)}
        aria-label={`Complete ${label}`}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-sm">
        {label}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label={`Schedule for ${selectedLabel}`}
        title={`Schedule for ${selectedLabel}`}
        onClick={onSchedule}
      >
        <CalendarPlus className="size-3.5" />
      </Button>
      <TaskDragHandle draggable={draggable} label={label} reorderable />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
      <CalendarDays className="size-8 text-muted-foreground" />
      <p className="font-medium">Nothing scheduled</p>
      <p className="text-muted-foreground text-sm">Add a task or enjoy the open space.</p>
    </div>
  );
}

function AgendaSectionBlock({
  section,
  onOpenTask,
  onToggleTask,
  onMoveTaskToToday,
  onToggleHabit,
  onIncrementHabit,
}: {
  section: AgendaSection;
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string, completed: boolean) => void;
  onMoveTaskToToday: (task: AgendaTaskRow["task"]) => void;
  onToggleHabit: (habit: AgendaHabit, dateKey: string, done: boolean) => void;
  onIncrementHabit: (habitId: string, dateKey: string, currentValue: number) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2
        className={cn(
          "px-0.5 font-medium text-muted-foreground text-xs uppercase tracking-wide",
          section.bucket === "overdue" && "text-destructive",
        )}
      >
        {section.label}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {section.rows.map((row) => (
          <li key={`${row.kind}-${row.id}`}>
            {row.kind === "task" ? (
              <TaskRow
                row={row}
                overdue={section.bucket === "overdue"}
                reorderable={
                  !row.completed &&
                  !row.task.hasDueTime &&
                  (section.bucket === "anytime" || section.bucket === "overdue")
                }
                onOpen={() => onOpenTask(row.id)}
                onToggle={(completed) => onToggleTask(row.id, completed)}
                onMoveToToday={() => onMoveTaskToToday(row.task)}
              />
            ) : (
              <HabitRow
                row={row}
                overdue={section.bucket === "overdue"}
                onToggle={(done) => onToggleHabit(row.habit, row.dateKey, done)}
                onIncrement={() => onIncrementHabit(row.id, row.dateKey, row.dayValue)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompletedSection({
  rows,
  onOpenTask,
  onToggleTask,
  onToggleHabit,
  onIncrementHabit,
}: {
  rows: AgendaRow[];
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string, completed: boolean) => void;
  onToggleHabit: (habit: AgendaHabit, dateKey: string, done: boolean) => void;
  onIncrementHabit: (habitId: string, dateKey: string, currentValue: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="border-t pt-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <CheckCircle2Icon className="size-4" />
        <span className="font-medium text-sm">Completed</span>
        <span className="text-xs tabular-nums">{rows.length}</span>
        <ChevronDown className={cn("ml-auto size-4 transition-transform", !expanded && "-rotate-90")} />
      </button>
      {expanded && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              {row.kind === "task" ? (
                <TaskRow
                  row={row}
                  overdue={false}
                  onOpen={() => onOpenTask(row.id)}
                  onToggle={(completed) => onToggleTask(row.id, completed)}
                />
              ) : (
                <HabitRow
                  row={row}
                  overdue={false}
                  onToggle={(done) => onToggleHabit(row.habit, row.dateKey, done)}
                  onIncrement={() => onIncrementHabit(row.id, row.dateKey, row.dayValue)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskRow({
  row,
  overdue,
  reorderable = false,
  onOpen,
  onToggle,
  onMoveToToday,
}: {
  row: AgendaTaskRow;
  overdue: boolean;
  reorderable?: boolean;
  onOpen: () => void;
  onToggle: (completed: boolean) => void;
  onMoveToToday?: () => void;
}) {
  const { task, completed } = row;
  const title = task.title.trim();
  const preview = useMemo(() => (title ? "" : noteContentToPlainText(task.content, 100)), [title, task.content]);
  const label = title || preview || "Untitled";
  const fromCalendar = isCalendarBackedTask(task);
  const timeLabel = task.hasDueTime && task.dueAt != null ? format(task.dueAt, "HH:mm") : null;
  const dueLabel = overdue && task.dueAt != null ? formatDueDateLabel(task.dueAt, task.hasDueTime) : null;
  const draggable = useDraggable({ id: task.id, data: { kind: "task" } });
  const droppable = useDroppable({ id: task.id, disabled: !reorderable });

  return (
    <div
      ref={(el) => {
        draggable.setNodeRef(el);
        droppable.setNodeRef(el);
      }}
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      className={cn(
        "group relative flex items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60",
        completed && "opacity-60",
        draggable.isDragging && "z-20 bg-card opacity-90 shadow-md",
      )}
    >
      <Checkbox
        checked={completed}
        onCheckedChange={(value) => onToggle(value === true)}
        className="mt-0.5"
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
        onClick={(e) => e.stopPropagation()}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-sm",
              completed && "line-through",
              !title && preview && "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {fromCalendar && (
            <CalendarClock
              className="mt-px size-3 shrink-0 text-muted-foreground"
              aria-label="From Google Calendar"
              role="img"
            />
          )}
          {timeLabel && !overdue && (
            <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{timeLabel}</span>
          )}
        </div>
        {dueLabel && <p className="mt-0.5 text-destructive text-xs">{dueLabel}</p>}
      </button>
      {overdue && (
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move to today"
            title="Move to today"
            onClick={onMoveToToday}
          >
            <CalendarPlus className="size-3.5" />
          </Button>
        </div>
      )}
      <TaskDragHandle draggable={draggable} label={label} reorderable={reorderable} />
    </div>
  );
}

function HabitRow({
  row,
  overdue,
  onToggle,
  onIncrement,
}: {
  row: AgendaHabitRow;
  overdue: boolean;
  onToggle: (done: boolean) => void;
  onIncrement: () => void;
}) {
  const { habit, value, done, editable } = row;
  const isSimple = habit.target <= 1;
  const ratio = habit.target > 0 ? Math.min(1, value / habit.target) : 0;
  const unitLabel = habit.unit.trim();
  const progressLabel = unitLabel ? `${value}/${habit.target} ${unitLabel}` : `${value}/${habit.target}`;
  // Overdue rows record against a past day, so name the day they belong to.
  const missedLabel = overdue ? format(parseDateKey(row.dateKey), "MMM d") : null;
  const completeLabel = missedLabel ? `Complete ${habit.name} for ${missedLabel}` : `Complete ${habit.name}`;

  return (
    <div className={cn("flex items-center gap-2 rounded-md px-1.5 py-1.5", done && "opacity-60")}>
      {isSimple ? (
        editable ? (
          <Checkbox
            checked={done}
            onCheckedChange={(v) => onToggle(v === true)}
            aria-label={done ? `Uncheck ${habit.name}` : completeLabel}
          />
        ) : (
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
              done && "border-primary bg-primary text-primary-foreground",
            )}
            aria-hidden
          >
            {done && <CheckIcon className="size-3" />}
          </span>
        )
      ) : (
        <span
          className={cn(
            "relative flex size-4 shrink-0 items-center justify-center rounded-full border",
            done ? "border-primary bg-primary text-primary-foreground" : "border-input",
          )}
          aria-hidden
        >
          {done ? (
            <CheckIcon className="size-3" />
          ) : (
            <span
              className="absolute inset-0.5 rounded-full"
              style={{ background: `conic-gradient(var(--primary) ${ratio * 360}deg, transparent 0)` }}
            />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", done && "line-through")}>
          {habit.name}
          {!editable && <span className="sr-only">{done ? " (done)" : " (not done)"}</span>}
        </p>
        {missedLabel && <p className="mt-0.5 text-destructive text-xs">{missedLabel}</p>}
        {!isSimple && <p className="text-muted-foreground text-xs tabular-nums">{progressLabel}</p>}
      </div>

      {!isSimple && editable && !done && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          aria-label={`Add 1 to ${habit.name}`}
          onClick={onIncrement}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
