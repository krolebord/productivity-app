import { habitTargetPeriodLabel, parseScheduleMonthDays, parseScheduleWeekdays } from "@productivity/core/agenda";
import { createHabit, type HabitInput, setHabitArchived, updateHabit, useHabit } from "@productivity/core/data/habits";
import { useDb } from "@productivity/core/user-db/db-context";
import type { HabitItem } from "@productivity/core/user-db/migrations";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ActionButton } from "../../../components/action-button";
import { SheetHeader } from "../../../components/screen-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { FieldError, FormOption, FormRow, FormSection } from "../../../components/ui/form";
import { Input } from "../../../components/ui/input";
import { KeyboardScreen } from "../../../components/ui/keyboard-screen";
import { Segmented } from "../../../components/ui/segmented";

type ScheduleType = HabitItem["scheduleType"];
type TimeOfDay = NonNullable<HabitItem["timeOfDay"]> | "anytime";

const SCHEDULE_TYPES: readonly { value: ScheduleType; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Once a week" },
  { value: "monthly", label: "Once a month" },
  { value: "everyNDays", label: "Every N days" },
  { value: "weekdays", label: "Specific weekdays" },
  { value: "monthDays", label: "Specific days of month" },
];

const TIME_OF_DAY_OPTIONS: readonly { value: TimeOfDay; label: string }[] = [
  { value: "anytime", label: "Any" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Noon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

type FormState = {
  name: string;
  scheduleType: ScheduleType;
  scheduleInterval: string;
  scheduleWeekdays: number[];
  scheduleMonthDays: number[];
  timeOfDay: TimeOfDay;
  target: string;
  unit: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function toFormState(habit: HabitItem | undefined): FormState {
  return {
    name: habit?.name ?? "",
    scheduleType: habit?.scheduleType ?? "daily",
    scheduleInterval: String(habit?.scheduleInterval ?? 2),
    scheduleWeekdays: habit ? parseScheduleWeekdays(habit.scheduleWeekdays) : [],
    scheduleMonthDays: habit ? parseScheduleMonthDays(habit.scheduleMonthDays) : [],
    timeOfDay: habit?.timeOfDay ?? "anytime",
    target: String(habit?.target ?? 1),
    unit: habit?.unit ?? "",
  };
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Name is required.";
  const interval = Number.parseInt(form.scheduleInterval, 10);
  if (form.scheduleType === "everyNDays" && (!Number.isInteger(interval) || interval < 1)) {
    errors.scheduleInterval = "Interval must be a whole number of at least 1.";
  }
  if (form.scheduleType === "weekdays" && form.scheduleWeekdays.length === 0) {
    errors.scheduleWeekdays = "Pick at least one weekday.";
  }
  if (form.scheduleType === "monthDays" && form.scheduleMonthDays.length === 0) {
    errors.scheduleMonthDays = "Pick at least one day of the month.";
  }
  const target = Number.parseFloat(form.target);
  if (!Number.isFinite(target) || target < 1) errors.target = "Target must be a number of at least 1.";
  return errors;
}

function toHabitInput(form: FormState): HabitInput {
  const { scheduleType } = form;
  const sorted = (values: number[]) => JSON.stringify([...values].sort((a, b) => a - b));
  return {
    name: form.name.trim(),
    scheduleType,
    scheduleInterval: scheduleType === "everyNDays" ? Math.max(1, Number.parseInt(form.scheduleInterval, 10) || 1) : 1,
    scheduleWeekdays: scheduleType === "weekdays" ? sorted(form.scheduleWeekdays) : "[]",
    scheduleMonthDays: scheduleType === "monthDays" ? sorted(form.scheduleMonthDays) : "[]",
    timeOfDay: form.timeOfDay === "anytime" ? null : form.timeOfDay,
    target: Math.max(1, Number.parseFloat(form.target) || 1),
    unit: form.unit.trim(),
  };
}

export default function HabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "new";
  const habit = useHabit(isNew ? null : id);

  if (!isNew && !habit) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title="Habit" onDone={() => router.back()} />
        <EmptyState icon="slash" title="This habit no longer exists" />
      </View>
    );
  }
  return <HabitForm habit={habit} />;
}

function HabitForm({ habit }: { habit: HabitItem | undefined }) {
  const db = useDb();
  const router = useRouter();
  const [form, setForm] = useState(() => toFormState(habit));
  const [showErrors, setShowErrors] = useState(false);
  const errors = validate(form);
  const visibleErrors = showErrors ? errors : {};

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const toggleIn = (values: number[], value: number) =>
    values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

  const save = () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (habit) updateHabit(db.db, habit.id, toHabitInput(form));
    else createHabit(db.db, toHabitInput(form));
    router.back();
  };

  const archived = habit?.archivedAt != null;

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title={habit ? "Edit habit" : "New habit"}
          onCancel={() => router.back()}
          onDone={save}
          doneLabel="Save"
        />
      }
    >
      <View className="gap-2">
        <FormSection>
          <Input
            value={form.name}
            onChangeText={(name) => update({ name })}
            placeholder="Habit name"
            className="h-12 px-4"
            autoFocus={!habit}
            returnKeyType="done"
          />
        </FormSection>
        <FieldError message={visibleErrors.name} />
      </View>

      <View className="gap-2">
        <FormSection title="Schedule">
          {SCHEDULE_TYPES.map((option, index) => (
            <FormOption
              key={option.value}
              label={option.label}
              selected={form.scheduleType === option.value}
              onPress={() => update({ scheduleType: option.value })}
              last={index === SCHEDULE_TYPES.length - 1}
            />
          ))}
        </FormSection>

        {form.scheduleType === "everyNDays" && (
          <FormSection>
            <FormRow label="Every" last>
              <Input
                value={form.scheduleInterval}
                onChangeText={(scheduleInterval) => update({ scheduleInterval })}
                keyboardType="number-pad"
                className="h-10 min-w-12 text-right"
              />
              <Text className="text-base text-muted-foreground">days</Text>
            </FormRow>
          </FormSection>
        )}
        {form.scheduleType === "weekdays" && (
          <View className="flex-row justify-between">
            {WEEKDAYS.map((label, index) => (
              <DayToggle
                key={label}
                label={label}
                selected={form.scheduleWeekdays.includes(index + 1)}
                onPress={() => update({ scheduleWeekdays: toggleIn(form.scheduleWeekdays, index + 1) })}
              />
            ))}
          </View>
        )}
        {form.scheduleType === "monthDays" && (
          <View className="flex-row flex-wrap gap-1.5">
            {MONTH_DAYS.map((day) => (
              <DayToggle
                key={day}
                label={String(day)}
                selected={form.scheduleMonthDays.includes(day)}
                onPress={() => update({ scheduleMonthDays: toggleIn(form.scheduleMonthDays, day) })}
              />
            ))}
          </View>
        )}
        <FieldError
          message={visibleErrors.scheduleInterval ?? visibleErrors.scheduleWeekdays ?? visibleErrors.scheduleMonthDays}
        />
      </View>

      <View className="gap-2">
        <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Time of day</Text>
        <Segmented
          options={TIME_OF_DAY_OPTIONS}
          value={form.timeOfDay}
          onChange={(timeOfDay) => update({ timeOfDay })}
        />
      </View>

      <View className="gap-2">
        <FormSection
          title="Goal"
          footer={`How much counts as done per ${habitTargetPeriodLabel(form.scheduleType)}. Leave at 1 for a simple check-off.`}
        >
          <FormRow label="Target">
            <Input
              value={form.target}
              onChangeText={(target) => update({ target })}
              keyboardType="decimal-pad"
              className="h-10 min-w-12 text-right"
            />
          </FormRow>
          <FormRow label="Unit" last>
            <Input
              value={form.unit}
              onChangeText={(unit) => update({ unit })}
              placeholder="e.g. glasses"
              className="h-10 min-w-32 text-right"
            />
          </FormRow>
        </FormSection>
        <FieldError message={visibleErrors.target} />
      </View>

      {habit && (
        <View className="flex-row">
          <ActionButton
            icon="archive"
            label={archived ? "Restore habit" : "Archive habit"}
            onPress={() => {
              setHabitArchived(db.db, habit.id, !archived);
              router.back();
            }}
          />
        </View>
      )}
    </KeyboardScreen>
  );
}

function DayToggle({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`size-11 items-center justify-center rounded-full ${selected ? "bg-primary" : "border border-border bg-card"}`}
    >
      <Text className={`font-medium text-sm ${selected ? "text-primary-foreground" : "text-foreground"}`}>{label}</Text>
    </Pressable>
  );
}
