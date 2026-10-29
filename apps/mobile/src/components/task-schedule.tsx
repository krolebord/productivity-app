import { combineLocalDateAndTime, localMidnightMs } from "@productivity/core/date-time";
import { format } from "date-fns";
import { DateTimeField } from "./date-time-field";
import { FormRow, FormSection, FormSwitch } from "./ui/form";

export type TaskScheduleFields = { dueAt: number | null; hasDueTime: boolean; completedAt: null };

const DEFAULT_TIME = "09:00";

/** Rescheduling, including moving to the inbox, reopens the task — same as on the web. */
export function TaskScheduleSection({
  dueAt,
  hasDueTime,
  onChange,
}: {
  dueAt: number | null;
  hasDueTime: boolean;
  onChange: (fields: TaskScheduleFields) => void;
}) {
  const selected = dueAt != null ? new Date(dueAt) : null;
  const time = selected && hasDueTime ? format(selected, "HH:mm") : DEFAULT_TIME;
  const commit = (nextDueAt: number | null, nextHasDueTime: boolean) =>
    onChange({ dueAt: nextDueAt, hasDueTime: nextHasDueTime, completedAt: null });

  return (
    <FormSection footer={selected ? undefined : "Unscheduled tasks live in the inbox."}>
      <FormSwitch
        label="Scheduled"
        value={selected != null}
        onValueChange={(on) => commit(on ? localMidnightMs(new Date()) : null, false)}
        last={selected == null}
      />
      {selected && (
        <>
          <FormRow label="Date">
            <DateTimeField
              mode="date"
              value={selected}
              onChange={(day) =>
                commit(hasDueTime ? combineLocalDateAndTime(day, time) : localMidnightMs(day), hasDueTime)
              }
            />
          </FormRow>
          <FormSwitch
            label="Time"
            value={hasDueTime}
            onValueChange={(on) =>
              commit(on ? combineLocalDateAndTime(selected, DEFAULT_TIME) : localMidnightMs(selected), on)
            }
            last={!hasDueTime}
          />
          {hasDueTime ? (
            <FormRow label="At" last>
              <DateTimeField
                mode="time"
                value={selected}
                onChange={(value) => commit(combineLocalDateAndTime(selected, format(value, "HH:mm")), true)}
              />
            </FormRow>
          ) : null}
        </>
      )}
    </FormSection>
  );
}
