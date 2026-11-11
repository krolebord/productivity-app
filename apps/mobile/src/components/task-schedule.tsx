import { taskBucket } from "@productivity/core/agenda";
import { combineLocalDateAndTime, localMidnightMs } from "@productivity/core/date-time";
import { addDays, format, isSameDay, isToday, isTomorrow } from "date-fns";
import { View } from "react-native";
import { DateTimeField } from "./date-time-field";
import { Chip } from "./ui/chip";
import { FormRow, FormSection, FormValue } from "./ui/form";

export type TaskScheduleFields = { dueAt: number | null; hasDueTime: boolean; completedAt: null };

type TimeOfDay = "anytime" | "morning" | "afternoon" | "evening";

const TIME_OF_DAY_OPTIONS: readonly { value: TimeOfDay; label: string }[] = [
  { value: "anytime", label: "All day" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

const TIME_OF_DAY_DEFAULTS: Record<Exclude<TimeOfDay, "anytime">, string> = {
  morning: "09:00",
  afternoon: "14:00",
  evening: "19:00",
};

/**
 * Quick picks for the day (Today, Tomorrow, the day after as its weekday, Unset) and the time of
 * day (matching Today's groups), above the date and, once set, the exact time. Day picks keep
 * the chosen time. Rescheduling, including unsetting the date, reopens the task — same as on the web.
 */
export function TaskScheduleSection({
  dueAt,
  hasDueTime,
  defaultDay,
  onChange,
}: {
  dueAt: number | null;
  hasDueTime: boolean;
  /** Where setting a date lands when the task has none, e.g. the day being viewed. */
  defaultDay?: Date;
  onChange: (fields: TaskScheduleFields) => void;
}) {
  const selected = dueAt != null ? new Date(dueAt) : null;
  const time = selected && hasDueTime ? format(selected, "HH:mm") : null;
  const commit = (nextDueAt: number | null, nextHasDueTime: boolean) =>
    onChange({ dueAt: nextDueAt, hasDueTime: nextHasDueTime, completedAt: null });
  const onDay = (day: Date) => commit(time ? combineLocalDateAndTime(day, time) : localMidnightMs(day), time != null);

  const today = new Date();
  const dayAfter = addDays(today, 2);

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        <Chip label="Today" selected={selected != null && isToday(selected)} onPress={() => onDay(today)} />
        <Chip
          label="Tomorrow"
          selected={selected != null && isTomorrow(selected)}
          onPress={() => onDay(addDays(today, 1))}
        />
        <Chip
          label={format(dayAfter, "EEE")}
          accessibilityLabel={format(dayAfter, "EEEE")}
          selected={selected != null && isSameDay(selected, dayAfter)}
          onPress={() => onDay(dayAfter)}
        />
        <Chip label="Unset" selected={selected == null} onPress={() => commit(null, false)} />
      </View>
      {selected ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            {TIME_OF_DAY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                // A night time (21:00–04:59) has no chip, so none shows as selected.
                selected={taskBucket({ dueAt, hasDueTime }) === option.value}
                onPress={() =>
                  commit(
                    option.value === "anytime"
                      ? localMidnightMs(selected)
                      : combineLocalDateAndTime(selected, TIME_OF_DAY_DEFAULTS[option.value]),
                    option.value !== "anytime",
                  )
                }
              />
            ))}
          </View>
          <FormSection>
            <FormRow label="Date" last={!time}>
              <DateTimeField mode="date" value={selected} onChange={onDay} />
            </FormRow>
            {time && (
              <FormRow label="Time" last>
                <DateTimeField
                  mode="time"
                  value={selected}
                  onChange={(value) => commit(combineLocalDateAndTime(selected, format(value, "HH:mm")), true)}
                />
              </FormRow>
            )}
          </FormSection>
        </>
      ) : (
        <FormSection>
          <FormRow label="Date" onPress={() => onDay(defaultDay ?? today)} last>
            <FormValue muted>None</FormValue>
          </FormRow>
        </FormSection>
      )}
    </View>
  );
}
