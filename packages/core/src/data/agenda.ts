import { addMonths, endOfMonth } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import {
  type AgendaHabit,
  type AgendaSection,
  type AgendaTask,
  addLocalDays,
  buildAgendaSections,
  compareHabits,
  dayHasIncompleteTasks,
  getDayHabitProgress,
  getHabitPeriodDays,
  getMonthGridDays,
  getWeekDays,
  type HabitEntryValuesByDate,
  isHabitPeriodSchedule,
  isTaskOverdueForToday,
  parseDateKey,
  parseScheduleMonthDays,
  parseScheduleWeekdays,
  startOfLocalDay,
  toAgendaHabit,
  toDateKey,
} from "../agenda";
import { combineLocalDateAndTime, localMidnightMs } from "../date-time";
import { isCalendarBackedTask } from "../google-calendar/mapping";
import { useDb, useDbQuery } from "../user-db/db-context";
import { setHabitEntryValue as writeHabitEntryValue } from "./habits";
import { createTask as insertTask, rescheduleTask, scheduleAllDayTask, setTaskCompleted } from "./tasks";

export function useAgendaHabits(): AgendaHabit[] {
  const { data: habitsRaw } = useDbQuery((q) => q.selectFrom("habit").selectAll());

  return useMemo(
    () =>
      habitsRaw
        .map((h) =>
          toAgendaHabit(h, parseScheduleWeekdays(h.scheduleWeekdays), parseScheduleMonthDays(h.scheduleMonthDays)),
        )
        .sort(compareHabits),
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

  return { entriesByHabit };
}

export type CalendarDayInfo = {
  date: Date;
  dateKey: string;
  hasIncompleteTasks: boolean;
  habitProgress: { due: number; done: number } | null;
};

/** `task`'s due time moved onto `day`: the same time of day for timed tasks, else all-day. */
function dueAtOnDay(task: Pick<AgendaTask, "dueAt" | "hasDueTime">, day: Date): number {
  if (!task.hasDueTime || task.dueAt == null) return localMidnightMs(day);
  const due = new Date(task.dueAt);
  return combineLocalDateAndTime(
    day,
    `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`,
  );
}

/** Agenda state for the selected day; `todayKey` comes from the platform's day-change watcher. */
export function useAgenda(todayKey: string) {
  const db = useDb();
  const today = useMemo(() => parseDateKey(todayKey), [todayKey]);

  // Null means follow `todayKey`, so an overnight tick advances the view
  // instead of pinning the day the tab was opened.
  const [pinnedDate, setPinnedDate] = useState<Date | null>(null);
  const selectedDate = pinnedDate ?? today;
  const selectedKey = pinnedDate ? toDateKey(pinnedDate) : todayKey;

  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const visibleDays = useMemo(
    () => (calendarExpanded ? getMonthGridDays(selectedDate) : getWeekDays(selectedDate)),
    [calendarExpanded, selectedDate],
  );
  const visibleStart = visibleDays[0] ?? selectedDate;
  const visibleEnd = visibleDays[visibleDays.length - 1] ?? selectedDate;
  // Monthly habits sum their whole calendar month, which can extend past a
  // collapsed week view, so entries are loaded up to the end of that month.
  const entriesEndKey = toDateKey(endOfMonth(visibleEnd));
  const visibleStartMs = localMidnightMs(visibleStart);
  const visibleEndExclusiveMs = localMidnightMs(visibleEnd) + 24 * 60 * 60 * 1000;
  const todayStartMs = localMidnightMs(today);

  const habits = useAgendaHabits();
  const agendaTasks = useScheduledTasks({
    rangeStartMs: visibleStartMs,
    rangeEndMs: visibleEndExclusiveMs,
    overdueBeforeMs: todayStartMs,
  });
  const inboxTasks = useInboxTasks();
  const { entriesByHabit } = useHabitEntries(entriesEndKey);

  const dayInfos: CalendarDayInfo[] = useMemo(
    () =>
      visibleDays.map((date) => {
        const dateKey = toDateKey(date);
        const progress = getDayHabitProgress(habits, dateKey, todayKey, entriesByHabit);
        return {
          date,
          dateKey,
          hasIncompleteTasks: dayHasIncompleteTasks(agendaTasks, dateKey),
          habitProgress: progress.due > 0 && dateKey <= todayKey ? progress : null,
        };
      }),
    [visibleDays, habits, todayKey, entriesByHabit, agendaTasks],
  );

  const sections: AgendaSection[] = useMemo(
    () =>
      buildAgendaSections({
        selectedKey,
        todayKey,
        tasks: agendaTasks,
        habits,
        entriesByHabit,
      }),
    [selectedKey, todayKey, agendaTasks, habits, entriesByHabit],
  );

  const selectDateKey = useCallback(
    (dateKey: string) => {
      setPinnedDate(dateKey === todayKey ? null : parseDateKey(dateKey));
    },
    [todayKey],
  );

  const goToToday = useCallback(() => {
    setPinnedDate(null);
  }, []);

  // Shifts by week when collapsed, by month when expanded.
  const shiftCalendar = useCallback(
    (delta: number) => {
      setPinnedDate((prev) => {
        const from = prev ?? today;
        const next = startOfLocalDay(calendarExpanded ? addMonths(from, delta) : addLocalDays(from, delta * 7));
        return toDateKey(next) === todayKey ? null : next;
      });
    },
    [calendarExpanded, today, todayKey],
  );

  const toggleCalendarExpanded = useCallback(() => {
    setCalendarExpanded((prev) => !prev);
  }, []);

  const isSelectedToday = selectedKey === todayKey;

  // Actions take the row they act on instead of reading query results, so they keep their
  // identity across refreshes and memoized rows don't re-render.
  const toggleTaskCompleted = useCallback(
    (task: AgendaTask, completed: boolean) => {
      // Finishing an overdue task logs it as done today instead of on the day it was missed.
      // Calendar-mirrored tasks keep their date, which the next sync would restore anyway.
      if (completed && isSelectedToday && isTaskOverdueForToday(task, todayKey) && !isCalendarBackedTask(task)) {
        rescheduleTask(db.db, task.id, dueAtOnDay(task, today), { completed: true });
        return;
      }
      setTaskCompleted(db.db, task.id, completed);
    },
    [db, isSelectedToday, todayKey, today],
  );

  const moveTaskToToday = useCallback(
    (task: AgendaTask) => {
      if (task.dueAt == null) return;
      rescheduleTask(db.db, task.id, dueAtOnDay(task, today));
    },
    [db, today],
  );

  const createTask = useCallback(
    (title: string, scheduled: boolean) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      insertTask(db.db, { title: trimmed, dueAt: scheduled ? localMidnightMs(selectedDate) : null });
    },
    [db, selectedDate],
  );

  const scheduleInboxTask = useCallback(
    (taskId: string) => {
      scheduleAllDayTask(db.db, taskId, localMidnightMs(selectedDate));
    },
    [db, selectedDate],
  );

  const completeInboxTask = useCallback(
    (taskId: string, completed: boolean) => {
      if (!completed) return;
      scheduleAllDayTask(db.db, taskId, localMidnightMs(selectedDate), { completed: true });
    },
    [db, selectedDate],
  );

  const { toggleHabitDone, incrementHabit } = useHabitEntryActions(todayKey);

  return {
    selectedDate,
    selectedKey,
    todayKey,
    isSelectedToday,
    calendarExpanded,
    toggleCalendarExpanded,
    dayInfos,
    sections,
    inboxTasks,
    selectDateKey,
    goToToday,
    shiftCalendar,
    createTask,
    scheduleInboxTask,
    completeInboxTask,
    toggleTaskCompleted,
    moveTaskToToday,
    toggleHabitDone,
    incrementHabit,
  };
}

/** Writes habit entries for a day; future days are ignored. */
export function useHabitEntryActions(todayKey: string) {
  const db = useDb();

  const setHabitEntryValue = useCallback(
    (habitId: string, dateKey: string, value: number) => {
      if (dateKey > todayKey) return;
      writeHabitEntryValue(db.db, { habitId, dateKey, value });
    },
    [db, todayKey],
  );

  const toggleHabitDone = useCallback(
    (habit: AgendaHabit, dateKey: string, done: boolean) => {
      if (done) {
        setHabitEntryValue(habit.id, dateKey, 1);
        return;
      }
      if (isHabitPeriodSchedule(habit.scheduleType)) {
        // A weekly/monthly habit's completion may live on another day of the period.
        for (const day of getHabitPeriodDays(habit.scheduleType, dateKey)) {
          setHabitEntryValue(habit.id, toDateKey(day), 0);
        }
        return;
      }
      setHabitEntryValue(habit.id, dateKey, 0);
    },
    [setHabitEntryValue],
  );

  const incrementHabit = useCallback(
    (habitId: string, dateKey: string, currentValue: number, amount = 1) => {
      setHabitEntryValue(habitId, dateKey, currentValue + amount);
    },
    [setHabitEntryValue],
  );

  return { setHabitEntryValue, toggleHabitDone, incrementHabit };
}
