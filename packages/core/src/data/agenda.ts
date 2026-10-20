import { useMemo } from "react";
import {
  type AgendaHabit,
  type AgendaTask,
  type HabitEntryValuesByDate,
  parseScheduleMonthDays,
  parseScheduleWeekdays,
  toAgendaHabit,
} from "../agenda";
import { useDbQuery } from "../user-db/db-context";

export function useAgendaHabits(): AgendaHabit[] {
  const { data: habitsRaw } = useDbQuery((q) => q.selectFrom("habit").selectAll().orderBy("order", "asc"));

  return useMemo(
    () =>
      habitsRaw.map((h) =>
        toAgendaHabit(h, parseScheduleWeekdays(h.scheduleWeekdays), parseScheduleMonthDays(h.scheduleMonthDays)),
      ),
    [habitsRaw],
  );
}

/**
 * Tasks due inside `[rangeStartMs, rangeEndMs)` plus incomplete tasks due before `overdueBeforeMs`.
 */
export function useScheduledTasks({
  rangeStartMs,
  rangeEndMs,
  overdueBeforeMs,
}: {
  rangeStartMs: number;
  rangeEndMs: number;
  overdueBeforeMs: number;
}) {
  // Any item with a dueAt belongs on the agenda regardless of kind, since dated
  // notes predate the explicit task type. Leading with dueAt lets item_due drive
  // both range branches instead of scanning every item.
  const { data } = useDbQuery((q) =>
    q
      .selectFrom("item")
      .select(["id", "title", "content", "dueAt", "hasDueTime", "completedAt", "order", "providerType"])
      .where("dueAt", "is not", null)
      .where((eb) =>
        eb.or([
          eb.and([eb("dueAt", ">=", rangeStartMs), eb("dueAt", "<", rangeEndMs)]),
          eb.and([eb("dueAt", "<", overdueBeforeMs), eb("completedAt", "is", null)]),
        ]),
      ),
  );
  return data as AgendaTask[];
}

export function useInboxTasks() {
  const { data } = useDbQuery((q) =>
    q
      .selectFrom("item")
      .select(["id", "title", "content", "dueAt", "hasDueTime", "completedAt", "order", "providerType"])
      .where("type", "=", "task")
      .where("dueAt", "is", null)
      .where("completedAt", "is", null)
      .orderBy("order", "asc")
      .orderBy("createdAt", "asc"),
  );
  return data as AgendaTask[];
}

/** Habit entries summed per habit and day, up to and including `endDateKey`. */
export function useHabitEntries(endDateKey: string) {
  // All entries (local SQLite is cheap). Needed so everyNDays can find the last
  // completion even when it falls outside the visible week.
  const { data: entriesRaw } = useDbQuery((q) =>
    q.selectFrom("habit_entry").select(["id", "habitId", "date", "value"]).where("date", "<=", endDateKey),
  );

  const entriesByHabit = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const entry of entriesRaw) {
      let byDate = map.get(entry.habitId);
      if (!byDate) {
        byDate = new Map();
        map.set(entry.habitId, byDate);
      }
      byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.value);
    }
    return map as ReadonlyMap<string, HabitEntryValuesByDate>;
  }, [entriesRaw]);

  const entryIdByHabitDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entriesRaw) {
      map.set(`${entry.habitId}:${entry.date}`, entry.id);
    }
    return map;
  }, [entriesRaw]);

  return { entriesByHabit, entryIdByHabitDate };
}
