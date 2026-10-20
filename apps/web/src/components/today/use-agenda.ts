import {
  type AgendaHabit,
  type AgendaSection,
  type AgendaTask,
  addLocalDays,
  buildAgendaSections,
  dayHasIncompleteTasks,
  getDayHabitProgress,
  getHabitPeriodDays,
  getMonthGridDays,
  getWeekDays,
  isHabitPeriodSchedule,
  parseDateKey,
  startOfLocalDay,
  toDateKey,
} from "@productivity/core/agenda";
import { useAgendaHabits, useHabitEntries, useInboxTasks, useScheduledTasks } from "@productivity/core/data/agenda";
import { setHabitEntryValue as writeHabitEntryValue } from "@productivity/core/data/habits";
import {
  createTask as insertTask,
  rescheduleTask,
  scheduleAllDayTask,
  setTaskCompleted,
} from "@productivity/core/data/tasks";
import { combineLocalDateAndTime, localMidnightMs } from "@productivity/core/date-time";
import { useDb } from "@productivity/core/user-db/db-context";
import { addMonths, endOfMonth } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { useCurrentDayKey } from "@/lib/use-current-day";

export type CalendarDayInfo = {
  date: Date;
  dateKey: string;
  hasIncompleteTasks: boolean;
  habitProgress: { due: number; done: number } | null;
};

export function useAgenda() {
  const db = useDb();
  const todayKey = useCurrentDayKey();
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
  const { entriesByHabit, entryIdByHabitDate } = useHabitEntries(entriesEndKey);

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

  const toggleTaskCompleted = useCallback(
    (taskId: string, completed: boolean) => {
      setTaskCompleted(db.db, taskId, completed);
    },
    [db],
  );

  const moveTaskToToday = useCallback(
    (task: AgendaTask) => {
      if (task.dueAt == null) return;
      let nextDueAt: number;
      if (task.hasDueTime) {
        const hours = new Date(task.dueAt).getHours();
        const minutes = new Date(task.dueAt).getMinutes();
        nextDueAt = combineLocalDateAndTime(
          today,
          `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        );
      } else {
        nextDueAt = localMidnightMs(today);
      }
      rescheduleTask(db.db, task.id, nextDueAt);
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

  const setHabitEntryValue = useCallback(
    (habitId: string, dateKey: string, value: number) => {
      if (dateKey > todayKey) return;
      writeHabitEntryValue(db.db, {
        existingEntryId: entryIdByHabitDate.get(`${habitId}:${dateKey}`),
        habitId,
        dateKey,
        value,
      });
    },
    [db, entryIdByHabitDate, todayKey],
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

  return {
    selectedDate,
    selectedKey,
    todayKey,
    isSelectedToday: selectedKey === todayKey,
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
