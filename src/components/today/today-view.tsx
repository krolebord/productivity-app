import { format } from "date-fns";
import { CalendarDays, CheckIcon, ChevronLeft, ChevronRight, PlusIcon } from "lucide-react";
import { useNoteDialogStore } from "@/components/note-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AgendaHabitRow, AgendaNoteRow, AgendaSection, DayHabitProgress } from "@/lib/agenda";
import { formatDueDateLabel } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import { useAgenda, type WeekDayInfo } from "./use-agenda";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export function TodayView() {
  const agenda = useAgenda();
  const openNoteDialog = useNoteDialogStore((s) => s.open);

  const headerLabel = agenda.isSelectedToday ? "Today" : format(agenda.selectedDate, "EEE, MMM d");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate font-semibold text-xl">{headerLabel}</h1>
        {!agenda.isSelectedToday && (
          <Button type="button" variant="outline" size="sm" onClick={agenda.goToToday}>
            Today
          </Button>
        )}
      </div>

      <WeekStrip
        days={agenda.weekDayInfos}
        selectedKey={agenda.selectedKey}
        todayKey={agenda.todayKey}
        onSelect={agenda.selectDateKey}
        onShiftWeek={agenda.shiftWeek}
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

function WeekStrip({
  days,
  selectedKey,
  todayKey,
  onSelect,
  onShiftWeek,
}: {
  days: WeekDayInfo[];
  selectedKey: string;
  todayKey: string;
  onSelect: (dateKey: string) => void;
  onShiftWeek: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 shrink-0 text-muted-foreground"
        aria-label="Previous week"
        onClick={() => onShiftWeek(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
        {days.map((day, index) => {
          const selected = day.dateKey === selectedKey;
          const isToday = day.dateKey === todayKey;
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => onSelect(day.dateKey)}
              aria-label={format(day.date, "EEEE, MMMM d")}
              aria-current={selected ? "date" : undefined}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                !selected && isToday && "text-foreground",
              )}
            >
              <span className="font-medium text-[10px] uppercase leading-none">{WEEKDAY_INITIALS[index]}</span>
              <span className="relative flex size-7 items-center justify-center">
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
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 shrink-0 text-muted-foreground"
        aria-label="Next week"
        onClick={() => onShiftWeek(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
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
      <CalendarDays className="size-6 text-muted-foreground" />
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
          <span className={cn("min-w-0 truncate text-sm", completed && "line-through")}>
            {note.title.trim() || "Untitled"}
          </span>
          {timeLabel && !overdue && (
            <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{timeLabel}</span>
          )}
        </div>
        {dueLabel && <p className="mt-0.5 text-destructive text-xs">{dueLabel}</p>}
      </button>
      {overdue && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onMoveToToday}>
            Move to today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Complete"
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
            "flex size-4 shrink-0 items-center justify-center rounded-full border font-medium text-[9px]",
            done ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground",
          )}
          aria-hidden
        >
          {done ? <CheckIcon className="size-3" /> : Math.min(99, Math.round((value / habit.target) * 100))}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", done && "line-through")}>{habit.name}</p>
        {!isSimple && <p className="text-muted-foreground text-xs tabular-nums">{progressLabel}</p>}
      </div>

      {!isSimple && editable && !done && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-7 shrink-0"
          aria-label={`Add 1 to ${habit.name}`}
          onClick={onIncrement}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
