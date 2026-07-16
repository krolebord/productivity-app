import { generateId } from "@sqlite-sync/core";
import { addMonths } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { parseScheduleWeekdays } from "@/components/habit-dialog";
import {
  type AgendaHabit,
  type AgendaNote,
  type AgendaSection,
  addLocalDays,
  buildAgendaSections,
  dayHasIncompleteNotes,
  getDayHabitProgress,
  getMonthGridDays,
  getWeekDays,
  type HabitEntryValuesByDate,
  parseDateKey,
  startOfLocalDay,
  toAgendaHabit,
  toDateKey,
} from "@/lib/agenda";
import { combineLocalDateAndTime, localMidnightMs } from "@/lib/date-time";
import { useDb, useDbQuery } from "@/user-db/user-db";

export type CalendarDayInfo = {
  date: Date;
  dateKey: string;
  hasIncompleteNotes: boolean;
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
  const visibleEndKey = toDateKey(visibleEnd);
  const visibleStartMs = localMidnightMs(visibleStart);
  const visibleEndExclusiveMs = localMidnightMs(visibleEnd) + 24 * 60 * 60 * 1000;
  const todayStartMs = localMidnightMs(today);

  const { data: habitsRaw } = useDbQuery((q) => q.selectFrom("habit").selectAll().orderBy("order", "asc"));

  const habits: AgendaHabit[] = useMemo(
    () => habitsRaw.map((h) => toAgendaHabit(h, parseScheduleWeekdays(h.scheduleWeekdays))),
    [habitsRaw],
  );

  // Notes due in the visible calendar range, plus incomplete notes before today (overdue).
  const { data: notes } = useDbQuery((q) =>
    q
      .selectFrom("item")
      .select(["id", "title", "content", "dueAt", "hasDueTime", "completedAt", "order"])
      .where("type", "=", "note")
      .where("dueAt", "is not", null)
      .where((eb) =>
        eb.or([
          eb.and([eb("dueAt", ">=", visibleStartMs), eb("dueAt", "<", visibleEndExclusiveMs)]),
          eb.and([eb("dueAt", "<", todayStartMs), eb("completedAt", "is", null)]),
        ]),
      ),
  );

  const agendaNotes = notes as AgendaNote[];

  // All entries (local SQLite is cheap). Needed so everyNDays can find the last
  // completion even when it falls outside the visible week.
  const { data: entriesRaw } = useDbQuery((q) =>
    q.selectFrom("habit_entry").select(["id", "habitId", "date", "value"]).where("date", "<=", visibleEndKey),
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
          hasIncompleteNotes: dayHasIncompleteNotes(agendaNotes, dateKey),
          habitProgress: progress.due > 0 && dateKey <= todayKey ? progress : null,
        };
      }),
    [visibleDays, habits, todayKey, entriesByHabit, agendaNotes],
  );

  const sections: AgendaSection[] = useMemo(
    () =>
      buildAgendaSections({
        selectedKey,
        todayKey,
        notes: agendaNotes,
        habits,
        entriesByHabit,
      }),
    [selectedKey, todayKey, agendaNotes, habits, entriesByHabit],
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

  const toggleNoteCompleted = useCallback(
    (noteId: string, completed: boolean) => {
      db.db.executeKysely((q) =>
        q
          .updateTable("item")
          .set({ completedAt: completed ? Date.now() : null })
          .where("id", "=", noteId),
      );
    },
    [db],
  );

  const moveNoteToToday = useCallback(
    (note: AgendaNote) => {
      if (note.dueAt == null) return;
      const todayDate = startOfLocalDay(new Date());
      let nextDueAt: number;
      if (note.hasDueTime) {
        const hours = new Date(note.dueAt).getHours();
        const minutes = new Date(note.dueAt).getMinutes();
        nextDueAt = combineLocalDateAndTime(
          todayDate,
          `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        );
      } else {
        nextDueAt = localMidnightMs(todayDate);
      }
      db.db.executeKysely((q) =>
        q.updateTable("item").set({ dueAt: nextDueAt, completedAt: null }).where("id", "=", note.id),
      );
    },
    [db],
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
      if (habit.scheduleType === "weekly") {
        // A weekly habit's completion may live on another day of the week.
        for (const day of getWeekDays(parseDateKey(dateKey))) {
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
    selectDateKey,
    goToToday,
    shiftCalendar,
    toggleNoteCompleted,
    moveNoteToToday,
    toggleHabitDone,
    incrementHabit,
  };
}
