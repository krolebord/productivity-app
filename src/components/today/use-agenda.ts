import { generateId } from "@sqlite-sync/core";
import { addMonths, endOfMonth } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { parseScheduleWeekdays } from "@/components/habit-dialog";
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
  type HabitEntryValuesByDate,
  isHabitPeriodSchedule,
  startOfLocalDay,
  toAgendaHabit,
  toDateKey,
} from "@/lib/agenda";
import { combineLocalDateAndTime, localMidnightMs } from "@/lib/date-time";
import { useDb, useDbQuery } from "@/user-db/user-db";

export type CalendarDayInfo = {
  date: Date;
  dateKey: string;
  hasIncompleteTasks: boolean;
  habitProgress: { due: number; done: number } | null;
};

export function useAgenda() {
  const db = useDb();
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));

  const [calendarExpanded, setCalendarExpanded] = useState(false);

  const today = startOfLocalDay(new Date());
  const todayKey = toDateKey(today);
  const selectedKey = toDateKey(selectedDate);
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

  const { data: habitsRaw } = useDbQuery((q) => q.selectFrom("habit").selectAll().orderBy("order", "asc"));

  const habits: AgendaHabit[] = useMemo(
    () => habitsRaw.map((h) => toAgendaHabit(h, parseScheduleWeekdays(h.scheduleWeekdays))),
    [habitsRaw],
  );

  // Scheduled tasks in the visible range, plus incomplete tasks before today
  // (overdue). The legacy clause keeps dated notes visible until the synced
  // item-kind migration has reached this replica.
  const { data: scheduledTasks } = useDbQuery((q) =>
    q
      .selectFrom("item")
      .select(["id", "title", "content", "dueAt", "hasDueTime", "completedAt", "order"])
      .where((eb) => eb.or([eb("type", "=", "task"), eb.and([eb("type", "=", "note"), eb("dueAt", "is not", null)])]))
      .where("dueAt", "is not", null)
      .where((eb) =>
        eb.or([
          eb.and([eb("dueAt", ">=", visibleStartMs), eb("dueAt", "<", visibleEndExclusiveMs)]),
          eb.and([eb("dueAt", "<", todayStartMs), eb("completedAt", "is", null)]),
        ]),
      ),
  );

  const agendaTasks = scheduledTasks as AgendaTask[];

  const { data: inboxTasks } = useDbQuery((q) =>
    q
      .selectFrom("item")
      .select(["id", "title", "content", "dueAt", "hasDueTime", "completedAt", "order"])
      .where("type", "=", "task")
      .where("dueAt", "is", null)
      .where("completedAt", "is", null)
      .orderBy("order", "asc")
      .orderBy("createdAt", "asc"),
  );

  // All entries (local SQLite is cheap). Needed so everyNDays can find the last
  // completion even when it falls outside the visible week.
  const { data: entriesRaw } = useDbQuery((q) =>
    q.selectFrom("habit_entry").select(["id", "habitId", "date", "value"]).where("date", "<=", entriesEndKey),
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

  const selectDateKey = useCallback((dateKey: string) => {
    const [y, m, d] = dateKey.split("-").map(Number);
    setSelectedDate(new Date(y, m - 1, d));
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(startOfLocalDay(new Date()));
  }, []);

  // Shifts by week when collapsed, by month when expanded.
  const shiftCalendar = useCallback(
    (delta: number) => {
      setSelectedDate((prev) =>
        startOfLocalDay(calendarExpanded ? addMonths(prev, delta) : addLocalDays(prev, delta * 7)),
      );
    },
    [calendarExpanded],
  );

  const toggleCalendarExpanded = useCallback(() => {
    setCalendarExpanded((prev) => !prev);
  }, []);

  const toggleTaskCompleted = useCallback(
    (taskId: string, completed: boolean) => {
      db.db.executeKysely((q) =>
        q
          .updateTable("item")
          .set({ completedAt: completed ? Date.now() : null })
          .where("id", "=", taskId),
      );
    },
    [db],
  );

  const moveTaskToToday = useCallback(
    (task: AgendaTask) => {
      if (task.dueAt == null) return;
      const todayDate = startOfLocalDay(new Date());
      let nextDueAt: number;
      if (task.hasDueTime) {
        const hours = new Date(task.dueAt).getHours();
        const minutes = new Date(task.dueAt).getMinutes();
        nextDueAt = combineLocalDateAndTime(
          todayDate,
          `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        );
      } else {
        nextDueAt = localMidnightMs(todayDate);
      }
      db.db.executeKysely((q) =>
        q.updateTable("item").set({ dueAt: nextDueAt, completedAt: null }).where("id", "=", task.id),
      );
    },
    [db],
  );

  const createTask = useCallback(
    (title: string, scheduled: boolean) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      const id = generateId();
      const createdAt = Date.now();
      db.db.executeTransaction((trx) => {
        const [maxOrderRow] = trx.executeKysely((q) =>
          q
            .selectFrom("item")
            .select((eb) => eb.fn.max("order").as("maxOrder"))
            .where("type", "=", "task"),
        ).rows;
        trx.executeKysely((q) =>
          q.insertInto("item").values({
            id,
            type: "task",
            title: trimmed,
            content: "",
            tags: "[]",
            dueAt: scheduled ? localMidnightMs(selectedDate) : null,
            hasDueTime: false,
            completedAt: null,
            order: Number(maxOrderRow?.maxOrder ?? 0) + 1,
            createdAt,
            tombstone: false,
          }),
        );
      });
    },
    [db, selectedDate],
  );

  const scheduleInboxTask = useCallback(
    (taskId: string) => {
      db.db.executeKysely((q) =>
        q
          .updateTable("item")
          .set({ dueAt: localMidnightMs(selectedDate), hasDueTime: false, completedAt: null })
          .where("id", "=", taskId),
      );
    },
    [db, selectedDate],
  );

  const completeInboxTask = useCallback(
    (taskId: string, completed: boolean) => {
      if (!completed) return;
      db.db.executeKysely((q) =>
        q
          .updateTable("item")
          .set({
            dueAt: localMidnightMs(selectedDate),
            hasDueTime: false,
            completedAt: Date.now(),
          })
          .where("id", "=", taskId),
      );
    },
    [db, selectedDate],
  );

  const setHabitEntryValue = useCallback(
    (habitId: string, dateKey: string, value: number) => {
      if (dateKey > todayKey) return;
      const existingId = entryIdByHabitDate.get(`${habitId}:${dateKey}`);
      const now = Date.now();

      if (existingId) {
        if (value <= 0) {
          db.db.executeKysely((q) => q.deleteFrom("habit_entry").where("id", "=", existingId));
        } else {
          db.db.executeKysely((q) =>
            q.updateTable("habit_entry").set({ value, updatedAt: now }).where("id", "=", existingId),
          );
        }
        return;
      }

      if (value <= 0) return;

      db.db.executeKysely((q) =>
        q.insertInto("habit_entry").values({
          id: generateId(),
          habitId,
          date: dateKey,
          value,
          createdAt: now,
          updatedAt: now,
          tombstone: false,
        }),
      );
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
    inboxTasks: inboxTasks as AgendaTask[],
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
