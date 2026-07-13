import { useDroppable } from "@dnd-kit/core";
import { format } from "date-fns";
import {
  CalendarDays,
  CalendarPlus,
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  PlusIcon,
} from "lucide-react";
import { useMemo } from "react";
import { calendarDayDroppableId, TODAY_AREA_DROPPABLE_ID } from "@/components/app-dnd";
import { useNoteDialogStore } from "@/components/note-dialog";
import { noteContentToPlainText } from "@/components/note-extensions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AgendaHabitRow, AgendaNoteRow, AgendaSection, DayHabitProgress } from "@/lib/agenda";
import { formatDueDateLabel } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import { type CalendarDayInfo, useAgenda } from "./use-agenda";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export function TodayView() {
  const agenda = useAgenda();
  const openNoteDialog = useNoteDialogStore((s) => s.open);

  // No-op drop target covering the whole view: keeps a dragged note's overlay
  // in calendar mode while it moves between day cells instead of flickering.
  const areaDroppable = useDroppable({ id: TODAY_AREA_DROPPABLE_ID });

  const headerLabel = agenda.isSelectedToday ? "Today" : format(agenda.selectedDate, "EEE, MMM d");

  return (
    <div ref={areaDroppable.setNodeRef} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate font-semibold text-xl">{headerLabel}</h1>
        {/* Always mounted so appearing/disappearing doesn't shift the header */}
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
        onSelect={agenda.selectDateKey}
        onShift={agenda.shiftCalendar}
      />

      {agenda.sections.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-5">
          {agenda.sections.map((section) => (
            <AgendaSectionBlock
              key={section.bucket}
              section={section}
              onOpenNote={openNoteDialog}
              onToggleNote={agenda.toggleNoteCompleted}
              onMoveNoteToToday={agenda.moveNoteToToday}
              onToggleHabit={agenda.toggleHabitDone}
              onIncrementHabit={agenda.incrementHabit}
            />
          ))}
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
  onSelect,
  onShift,
}: {
  days: CalendarDayInfo[];
  expanded: boolean;
  selectedDate: Date;
  selectedKey: string;
  todayKey: string;
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
  onSelect,
}: {
  day: CalendarDayInfo;
  initial?: string;
  selected: boolean;
  isToday: boolean;
  muted?: boolean;
  onSelect: (dateKey: string) => void;
}) {
  // Notes dragged from the notes grid can be dropped here to reschedule them.
  const droppable = useDroppable({ id: calendarDayDroppableId(day.dateKey) });

  return (
    <button
      ref={droppable.setNodeRef}
      type="button"
      onClick={() => onSelect(day.dateKey)}
      aria-label={format(day.date, "EEEE, MMMM d")}
      aria-current={isToday ? "date" : undefined}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-center gap-px rounded-md py-1 transition-colors",
        selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        !selected && isToday && "text-foreground",
        muted && !selected && "opacity-40",
        droppable.isOver && "opacity-100 ring-2 ring-ring",
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
          day.hasIncompleteNotes ? (selected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
      <CalendarDays className="size-8 text-muted-foreground" />
      <p className="font-medium">Nothing scheduled</p>
      <p className="text-muted-foreground text-sm">No notes or habits due on this day.</p>
    </div>
  );
}

function AgendaSectionBlock({
  section,
  onOpenNote,
  onToggleNote,
  onMoveNoteToToday,
  onToggleHabit,
  onIncrementHabit,
}: {
  section: AgendaSection;
  onOpenNote: (id: string) => void;
  onToggleNote: (id: string, completed: boolean) => void;
  onMoveNoteToToday: (note: AgendaNoteRow["note"]) => void;
  onToggleHabit: (habitId: string, dateKey: string, done: boolean) => void;
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
            {row.kind === "note" ? (
              <NoteRow
                row={row}
                overdue={section.bucket === "overdue"}
                onOpen={() => onOpenNote(row.id)}
                onToggle={(completed) => onToggleNote(row.id, completed)}
                onMoveToToday={() => onMoveNoteToToday(row.note)}
              />
            ) : (
              <HabitRow
                row={row}
                onToggle={(done) => onToggleHabit(row.id, row.dateKey, done)}
                onIncrement={() => onIncrementHabit(row.id, row.dateKey, row.value)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoteRow({
  row,
  overdue,
  onOpen,
  onToggle,
  onMoveToToday,
}: {
  row: AgendaNoteRow;
  overdue: boolean;
  onOpen: () => void;
  onToggle: (completed: boolean) => void;
  onMoveToToday: () => void;
}) {
  const { note, completed } = row;
  const title = note.title.trim();
  // Only parse the body when we actually need a fallback (no title).
  const preview = useMemo(() => (title ? "" : noteContentToPlainText(note.content, 100)), [title, note.content]);
  const label = title || preview || "Untitled";
  const timeLabel = note.hasDueTime && note.dueAt != null ? format(note.dueAt, "HH:mm") : null;
  const dueLabel = overdue && note.dueAt != null ? formatDueDateLabel(note.dueAt, note.hasDueTime) : null;

  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60",
        completed && "opacity-60",
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Complete"
            title="Complete"
            onClick={() => onToggle(true)}
          >
            <CheckIcon className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function HabitRow({
  row,
  onToggle,
  onIncrement,
}: {
  row: AgendaHabitRow;
  onToggle: (done: boolean) => void;
  onIncrement: () => void;
}) {
  const { habit, value, done, editable } = row;
  const isSimple = habit.target <= 1;
  const ratio = habit.target > 0 ? Math.min(1, value / habit.target) : 0;
  const unitLabel = habit.unit.trim();
  const progressLabel = unitLabel ? `${value}/${habit.target} ${unitLabel}` : `${value}/${habit.target}`;

  return (
    <div className={cn("flex items-center gap-2 rounded-md px-1.5 py-1.5", done && "opacity-60")}>
      {isSimple ? (
        editable ? (
          <Checkbox
            checked={done}
            onCheckedChange={(v) => onToggle(v === true)}
            aria-label={done ? `Uncheck ${habit.name}` : `Complete ${habit.name}`}
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
