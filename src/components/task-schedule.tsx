import { format, isSameDay } from "date-fns";
import { CalendarIcon, ClockIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { combineLocalDateAndTime, localMidnightMs } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { TimeInput } from "./ui/time-input";

export type TaskScheduleFields = {
  dueAt: number | null;
  hasDueTime: boolean;
  completedAt: number | null;
};

type TaskScheduleControlProps = {
  dueAt: number | null;
  hasDueTime: boolean;
  onChange: (fields: TaskScheduleFields) => void;
};

export function TaskScheduleControl({ dueAt, hasDueTime, onChange }: TaskScheduleControlProps) {
  const [open, setOpen] = useState(false);
  const selected = dueAt != null ? new Date(dueAt) : undefined;
  const time = selected && hasDueTime ? format(selected, "HH:mm") : "09:00";

  function commit(nextDueAt: number | null, nextHasDueTime: boolean) {
    onChange({
      dueAt: nextDueAt,
      hasDueTime: nextHasDueTime,
      // Rescheduling, including moving to Inbox, reopens the task.
      completedAt: null,
    });
  }

  function handleDateSelect(day: Date | undefined) {
    if (!day) {
      setOpen(false);
      return;
    }

    const isReselect = selected != null && isSameDay(day, selected);
    commit(hasDueTime ? combineLocalDateAndTime(day, time) : localMidnightMs(day), hasDueTime);
    if (isReselect) setOpen(false);
  }

  function handleTimeChange(newTime: string) {
    commit(combineLocalDateAndTime(selected ?? new Date(), newTime), true);
  }

  function handleAddTime() {
    commit(combineLocalDateAndTime(selected ?? new Date(), time), true);
  }

  function handleRemoveTime() {
    if (selected) commit(localMidnightMs(selected), false);
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
            size="sm"
            aria-label={selected ? `Scheduled ${display}` : "Schedule task"}
            className={cn(
              "h-8 gap-1.5 px-2 font-normal text-muted-foreground",
              selected ? "text-foreground" : "border border-dashed",
            )}
          >
            <CalendarIcon className="size-3.5" />
            <span className="text-xs">{display ?? "Inbox"}</span>
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
            {hasDueTime ? (
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
          aria-label="Move task to Inbox"
          title="Move to Inbox"
          onClick={() => commit(null, false)}
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
