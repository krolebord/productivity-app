import {
  type AgendaHabit,
  addLocalDays,
  getEntryValue,
  getHabitProgressValue,
  type HabitEntryValuesByDate,
  habitTargetPeriodLabel,
  isHabitDoneOnDay,
  isHabitDueOnDay,
  parseDateKey,
  toDateKey,
} from "@productivity/core/agenda";
import { useAgendaHabits, useHabitEntries, useHabitEntryActions } from "@productivity/core/data/agenda";
import { saveHabitOrder } from "@productivity/core/data/habits";
import { useReorderable } from "@productivity/core/use-reorderable";
import { useDb } from "@productivity/core/user-db/db-context";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { type DragHandle, ReorderableList } from "../../components/reorderable-list";
import { ScreenHeader } from "../../components/screen-header";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { confirmHabitReset } from "../../lib/habits";
import { useCurrentDayKey } from "../../lib/use-current-day";

const DAYS_SHOWN = 7;
/** Cards have a fixed height (plus the gap below) so they can be dragged into a new slot. */
const CARD_HEIGHT = 140;
const CARD_GAP = 12;
const TIME_OF_DAY_LABELS: Record<NonNullable<AgendaHabit["timeOfDay"]>, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function describeHabitSchedule(habit: AgendaHabit): string {
  switch (habit.scheduleType) {
    case "daily":
      return "Every day";
    case "weekly":
      return "Once a week";
    case "monthly":
      return "Once a month";
    case "everyNDays":
      return habit.scheduleInterval === 1 ? "Every day" : `Every ${habit.scheduleInterval} days`;
    case "weekdays":
      return habit.scheduleWeekdays.map((day) => WEEKDAY_SHORT[day - 1]).join(", ") || "No days";
    case "monthDays":
      return `Days ${habit.scheduleMonthDays.join(", ")}`;
  }
}

export default function HabitsScreen() {
  const router = useRouter();
  const db = useDb();
  const todayKey = useCurrentDayKey();
  const habits = useAgendaHabits();
  const { entriesByHabit, entryIdByHabitDate } = useHabitEntries(todayKey);
  const actions = useHabitEntryActions(entryIdByHabitDate, todayKey);
  const [showArchived, setShowArchived] = useState(false);

  const days = useMemo(() => {
    const today = parseDateKey(todayKey);
    return Array.from({ length: DAYS_SHOWN }, (_, i) => addLocalDays(today, i - (DAYS_SHOWN - 1)));
  }, [todayKey]);

  const activeHabits = useMemo(() => habits.filter((habit) => habit.archivedAt == null), [habits]);
  const archived = habits.filter((habit) => habit.archivedAt != null);
  const saveOrder = useCallback((changes: { id: string; order: number }[]) => saveHabitOrder(db.db, changes), [db]);
  const { items: active, move } = useReorderable(activeHabits, saveOrder);
  const [dragging, setDragging] = useState(false);
  const open = (id: string) => router.push({ pathname: "/habit/[id]", params: { id } });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Habits"
        onBack={router.back}
        actions={<IconButton icon="plus" label="New habit" onPress={() => open("new")} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-5 pt-1 pb-10" scrollEnabled={!dragging}>
        {active.length === 0 && (
          <EmptyState icon="repeat" title="No habits yet" description="Tap + to start tracking a habit." />
        )}
        {active.length > 0 && (
          // The last card's gap stands in for the list's own gap to what follows.
          <View style={{ marginBottom: -CARD_GAP }}>
            <ReorderableList
              items={active}
              rowHeight={CARD_HEIGHT + CARD_GAP}
              onMove={move}
              onDraggingChange={setDragging}
              renderItem={(habit, handle) => (
                <HabitCard
                  habit={habit}
                  handle={handle}
                  days={days}
                  todayKey={todayKey}
                  entries={entriesByHabit.get(habit.id)}
                  onOpen={() => open(habit.id)}
                  onToggle={(dateKey, done) => actions.toggleHabitDone(habit, dateKey, done)}
                  onIncrement={(dateKey, current) => actions.incrementHabit(habit.id, dateKey, current)}
                />
              )}
            />
          </View>
        )}

        {archived.length > 0 && (
          <View className="mt-2 gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showArchived }}
              onPress={() => setShowArchived((value) => !value)}
              className="flex-row items-center gap-1 py-1"
            >
              <Icon
                name={showArchived ? "chevron-down" : "chevron-right"}
                size={14}
                colorClassName="accent-muted-foreground"
              />
              <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Archived · {archived.length}
              </Text>
            </Pressable>
            {showArchived &&
              archived.map((habit) => (
                <Pressable
                  key={habit.id}
                  accessibilityRole="button"
                  onPress={() => open(habit.id)}
                  className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 opacity-70 active:opacity-50"
                >
                  <Icon name="archive" size={14} colorClassName="accent-muted-foreground" />
                  <Text className="flex-1 text-base text-foreground">{habit.name}</Text>
                </Pressable>
              ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function HabitCard({
  habit,
  handle,
  days,
  todayKey,
  entries,
  onOpen,
  onToggle,
  onIncrement,
}: {
  habit: AgendaHabit;
  handle: DragHandle;
  days: Date[];
  todayKey: string;
  entries: HabitEntryValuesByDate | undefined;
  onOpen: () => void;
  onToggle: (dateKey: string, done: boolean) => void;
  onIncrement: (dateKey: string, currentValue: number) => void;
}) {
  const isCounter = habit.target > 1;
  const todayProgress = getHabitProgressValue(habit, todayKey, entries);
  const unit = habit.unit.trim();
  const period = habitTargetPeriodLabel(habit.scheduleType);
  const timeLabel = habit.timeOfDay ? TIME_OF_DAY_LABELS[habit.timeOfDay] : null;

  return (
    <View className="justify-between rounded-xl border border-border bg-card p-4" style={{ height: CARD_HEIGHT }}>
      <View className="flex-row items-center gap-2">
        {handle(
          <View
            accessibilityLabel={`Reorder ${habit.name}`}
            accessibilityHint="Hold and drag to move"
            className="-ml-2 h-10 justify-center pr-1 pl-2"
          >
            <Icon name="menu" size={16} colorClassName="accent-muted-foreground/60" />
          </View>,
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          className="min-w-0 flex-1 flex-row items-center gap-2 active:opacity-70"
        >
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-semibold text-base text-card-foreground">
              {habit.name}
            </Text>
            <Text numberOfLines={1} className="text-muted-foreground text-sm">
              {describeHabitSchedule(habit)}
              {isCounter ? ` · ${todayProgress}/${habit.target}${unit ? ` ${unit}` : ""} this ${period}` : ""}
            </Text>
          </View>
          {timeLabel && (
            <Text className="rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
              {timeLabel}
            </Text>
          )}
          <Icon name="chevron-right" size={18} colorClassName="accent-muted-foreground" />
        </Pressable>
      </View>
      <View className="flex-row justify-between">
        {days.map((day) => {
          const dateKey = toDateKey(day);
          const dayValue = getEntryValue(entries, dateKey);
          const progress = getHabitProgressValue(habit, dateKey, entries);
          const done = isHabitDoneOnDay(habit.target, progress);
          const recorded = dayValue > 0;
          const due = isHabitDueOnDay(habit, dateKey, todayKey, entries);
          const isToday = dateKey === todayKey;

          return (
            <Pressable
              key={dateKey}
              accessibilityRole="button"
              accessibilityLabel={`${format(day, "EEEE")}: ${done ? "done" : "not done"}`}
              onPress={() =>
                done
                  ? confirmHabitReset(habit, progress, () => onToggle(dateKey, false))
                  : isCounter
                    ? onIncrement(dateKey, dayValue)
                    : onToggle(dateKey, true)
              }
              // Clears a partly logged counter day too, which a tap would only add to.
              onLongPress={() =>
                (recorded || done) && confirmHabitReset(habit, progress, () => onToggle(dateKey, false))
              }
              className="items-center gap-1"
            >
              <Text className={`text-[11px] ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {format(day, "EEEEE")}
              </Text>
              <View
                className={`size-9 items-center justify-center rounded-full ${
                  recorded || done
                    ? "bg-primary"
                    : due
                      ? "border-2 border-primary/50"
                      : "border border-border border-dashed"
                } ${done && !recorded ? "opacity-40" : ""}`}
              >
                {recorded && isCounter && !done ? (
                  <Text className="font-semibold text-primary-foreground text-xs">{dayValue}</Text>
                ) : recorded || done ? (
                  <Icon name="check" size={16} colorClassName="accent-primary-foreground" />
                ) : (
                  <Text className="text-muted-foreground text-xs">{day.getDate()}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
