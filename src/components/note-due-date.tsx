import { format, isSameDay } from "date-fns";
import { CalendarIcon, CheckIcon, ClockIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { combineLocalDateAndTime, formatDueDateLabel, isNoteDueOverdue, localMidnightMs } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import type { NoteItem } from "@/user-db/migrations";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { TimeInput } from "./ui/time-input";

export type NoteDueFields = {
  dueAt: number | null;
  hasDueTime: boolean;
  completedAt: number | null;
};

export function NoteDueBadge({
  note,
  className,
}: {
  note: Pick<NoteItem, "dueAt" | "hasDueTime" | "completedAt">;
  className?: string;
}) {
  if (note.dueAt == null) return null;

  const completed = note.completedAt != null;
  const overdue = isNoteDueOverdue(note.dueAt, note.hasDueTime, note.completedAt);
  const label = formatDueDateLabel(note.dueAt, note.hasDueTime);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px]",
        completed && "bg-muted text-muted-foreground",
        overdue && "bg-destructive/10 text-destructive",
        !completed && !overdue && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {completed ? <CheckIcon className="size-3" /> : <CalendarIcon className="size-3" />}
      {label}
    </span>
  );
}

type NoteDueDateControlProps = {
  dueAt: number | null;
  hasDueTime: boolean;
  onChange: (fields: NoteDueFields) => void;
};

export function NoteDueDateControl({ dueAt, hasDueTime, onChange }: NoteDueDateControlProps) {
  const [open, setOpen] = useState(false);
  const selected = dueAt != null ? new Date(dueAt) : undefined;
  const time = selected && hasDueTime ? format(selected, "HH:mm") : "09:00";
  const showTime = hasDueTime;

  function commit(nextDueAt: number | null, nextHasDueTime: boolean) {
    onChange({
      dueAt: nextDueAt,
      hasDueTime: nextHasDueTime,
      // Rescheduling (or clearing) revives a completed agenda item.
      completedAt: null,
    });
  }

  function handleDateSelect(day: Date | undefined) {
    if (!day) {
      setOpen(false);
      return;
    }

    const isReSelect = selected != null && isSameDay(day, selected);
    if (showTime) {
      commit(combineLocalDateAndTime(day, time), true);
    } else {
      commit(localMidnightMs(day), false);
    }

    if (isReSelect) {
      setOpen(false);
    }
  }

  function handleTimeChange(newTime: string) {
    const day = selected ?? new Date();
    commit(combineLocalDateAndTime(day, newTime), true);
  }

  function handleAddTime() {
    const day = selected ?? new Date();
    commit(combineLocalDateAndTime(day, time), true);
  }

  function handleRemoveTime() {
    if (!selected) return;
    commit(localMidnightMs(selected), false);
  }

  function handleClear() {
    commit(null, false);
    setOpen(false);
  }

  const display = selected
    ? hasDueTime
      ? format(selected, "MMM d, yyyy HH:mm")
      : format(selected, "MMM d, yyyy")
    : null;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={selected ? "sm" : "icon-sm"}
            aria-label={selected ? `Due ${display}` : "Set due date"}
            className={cn(
              "font-normal text-muted-foreground",
              selected ? "h-8 gap-1.5 px-2 text-foreground" : "size-7",
            )}
          >
            <CalendarIcon className="size-3.5" />
            {display && <span className="text-xs">{display}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            required
            selected={selected}
            onSelect={handleDateSelect}
            defaultMonth={selected}
            className="border-b"
          />
          <div className="flex flex-col gap-2 px-3 py-2">
            {showTime ? (
              <div className="flex items-center gap-2">
                <TimeInput value={time} onChange={handleTimeChange} className="min-w-0 flex-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-muted-foreground text-xs"
                  onClick={handleRemoveTime}
                >
                  Remove time
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 justify-start gap-1.5 px-2 text-muted-foreground"
                onClick={handleAddTime}
                disabled={!selected}
              >
                <ClockIcon className="size-3.5" />
                Add time
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground"
          aria-label="Clear due date"
          onClick={handleClear}
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
