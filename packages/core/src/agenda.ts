import { addDays, endOfMonth, format, getISODay, startOfMonth, startOfWeek } from "date-fns";
import { localMidnightMs } from "./date-time";
import { dateKeyInZone, hourInZone, zonedMidnightMs } from "./time-zone";

export type AgendaBucket = "overdue" | "morning" | "afternoon" | "evening" | "night" | "anytime";

export const AGENDA_BUCKETS: readonly AgendaBucket[] = [
  "overdue",
  "morning",
  "afternoon",
  "anytime",
  "evening",
  "night",
] as const;

export const AGENDA_BUCKET_LABELS: Record<AgendaBucket, string> = {
  overdue: "Overdue",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  anytime: "Anytime",
};

export type HabitScheduleType = "daily" | "weekly" | "monthly" | "everyNDays" | "weekdays" | "monthDays";

export type HabitPeriodScheduleType = "weekly" | "monthly";
export type HabitTimeOfDay = "morning" | "afternoon" | "evening" | "night" | null;

export type AgendaHabit = {
  id: string;
  name: string;
  scheduleType: HabitScheduleType;
  scheduleInterval: number;
  scheduleWeekdays: number[];
  scheduleMonthDays: number[];
  timeOfDay: HabitTimeOfDay;
  target: number;
  unit: string;
  order: number;
  archivedAt: number | null;
  createdAt: number;
};

export type HabitEntryValuesByDate = ReadonlyMap<string, number>;

export type AgendaTask = {
  id: string;
  title: string;
  content: string;
  dueAt: number | null;
  hasDueTime: boolean;
  completedAt: number | null;
  order: number | null;
  providerType: string | null;
};

export type AgendaTaskRow = {
  kind: "task";
  id: string;
  task: AgendaTask;
  bucket: AgendaBucket;
  completed: boolean;
  sortTime: number | null;
};

export type AgendaHabitRow = {
  kind: "habit";
  id: string;
  habit: AgendaHabit;
  bucket: AgendaBucket;
  /** The day this row records against — a past day for rows in the overdue bucket. */
  dateKey: string;
  value: number;
  dayValue: number;
  done: boolean;
  editable: boolean;
};

export type AgendaRow = AgendaTaskRow | AgendaHabitRow;

export type AgendaSection = {
  bucket: AgendaBucket;
  label: string;
  rows: AgendaRow[];
};

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar day of the instant `ms`: in `timeZone` when given, else in the runtime's zone. */
function dateKeyOfMs(ms: number, timeZone?: string): string {
  return timeZone ? dateKeyInZone(ms, timeZone) : toDateKey(new Date(ms));
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeekMonday(date: Date): Date {
  return startOfWeek(startOfLocalDay(date), { weekStartsOn: 1 });
}

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMonthGridDays(date: Date): Date[] {
  const start = startOfWeekMonday(startOfMonth(date));
  const endExclusive = addDays(startOfWeekMonday(endOfMonth(date)), 7);
  const days: Date[] = [];
  for (let day = start; day < endExclusive; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export function addLocalDays(date: Date, days: number): Date {
  return addDays(startOfLocalDay(date), days);
}

export function isHabitDoneOnDay(target: number, value: number): boolean {
  return value >= target;
}

export function getEntryValue(entries: HabitEntryValuesByDate | undefined, dateKey: string): number {
  return entries?.get(dateKey) ?? 0;
}

/**
 * Archived habits disappear from the archive day onward; days that already
 * have a recorded entry keep showing so history stays intact.
 */
export function isHabitArchivedOn(habit: Pick<AgendaHabit, "archivedAt">, dateKey: string, timeZone?: string): boolean {
  if (habit.archivedAt == null) return false;
  return dateKeyOfMs(habit.archivedAt, timeZone) <= dateKey;
}

function lastDoneDateBefore(
  habit: Pick<AgendaHabit, "target">,
  entries: HabitEntryValuesByDate | undefined,
  beforeKey: string,
): string | null {
  if (!entries) return null;
  let last: string | null = null;
  for (const [dateKey, value] of entries) {
    if (dateKey >= beforeKey) continue;
    if (!isHabitDoneOnDay(habit.target, value)) continue;
    if (last == null || dateKey > last) last = dateKey;
  }
  return last;
}

function anyDoneInRange(
  habit: Pick<AgendaHabit, "target">,
  entries: HabitEntryValuesByDate | undefined,
  startKey: string,
  endKey: string,
): boolean {
  if (!entries) return false;
  for (const [dateKey, value] of entries) {
    if (dateKey < startKey || dateKey > endKey) continue;
    if (isHabitDoneOnDay(habit.target, value)) return true;
  }
  return false;
}

function sumValuesInRange(entries: HabitEntryValuesByDate | undefined, startKey: string, endKey: string): number {
  if (!entries) return 0;
  let sum = 0;
  for (const [dateKey, value] of entries) {
    if (dateKey < startKey || dateKey > endKey) continue;
    sum += value;
  }
  return sum;
}

export function habitTargetPeriodLabel(scheduleType: HabitScheduleType): "day" | "week" | "month" {
  if (scheduleType === "weekly") return "week";
  if (scheduleType === "monthly") return "month";
  return "day";
}

export function isHabitPeriodSchedule(scheduleType: HabitScheduleType): scheduleType is HabitPeriodScheduleType {
  return scheduleType === "weekly" || scheduleType === "monthly";
}

export function habitPeriodRange(scheduleType: HabitPeriodScheduleType, dateKey: string): [string, string] {
  const date = parseDateKey(dateKey);
  if (scheduleType === "monthly") return [toDateKey(startOfMonth(date)), toDateKey(endOfMonth(date))];
  const days = getWeekDays(date);
  return [toDateKey(days[0] ?? date), toDateKey(days[6] ?? date)];
}

export function getHabitPeriodDays(scheduleType: HabitPeriodScheduleType, dateKey: string): Date[] {
  const [startKey, endKey] = habitPeriodRange(scheduleType, dateKey);
  const days: Date[] = [];
  for (let day = parseDateKey(startKey); toDateKey(day) <= endKey; day = addLocalDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * Progress value shown for a habit on a day: weekly/monthly habits accumulate
 * their target over the calendar period containing the day; others count per day.
 */
export function getHabitProgressValue(
  habit: Pick<AgendaHabit, "scheduleType">,
  dateKey: string,
  entries: HabitEntryValuesByDate | undefined,
): number {
  if (!isHabitPeriodSchedule(habit.scheduleType)) return getEntryValue(entries, dateKey);
  const [startKey, endKey] = habitPeriodRange(habit.scheduleType, dateKey);
  return sumValuesInRange(entries, startKey, endKey);
}

/**
 * Whether a habit should appear on local day `dateKey`.
 *
 * @param todayKey - "today" in local TZ; used to distinguish past vs current/future period rules.
 */
export function isHabitDueOnDay(
  habit: AgendaHabit,
  dateKey: string,
  todayKey: string,
  entries: HabitEntryValuesByDate | undefined,
  timeZone?: string,
): boolean {
  const valueOnDay = getEntryValue(entries, dateKey);
  if (isHabitArchivedOn(habit, dateKey, timeZone) && valueOnDay <= 0) return false;

  const doneOnDay = isHabitDoneOnDay(habit.target, valueOnDay);

  switch (habit.scheduleType) {
    case "daily":
      return true;

    case "weekdays":
    case "monthDays":
      return isCalendarDueOnDay(habit, dateKey);

    case "weekly":
    case "monthly":
      return isPeriodDueOnDay(habit, habit.scheduleType, dateKey, todayKey, entries, valueOnDay);

    case "everyNDays":
      return isEveryNDaysDueOnDay(habit, dateKey, entries, doneOnDay, timeZone);

    default:
      return false;
  }
}

/**
 * Day-of-month schedules fire on their chosen dates; a date past the end of a
 * short month (e.g. the 31st in February) clamps onto that month's last day, so
 * every selected day fires exactly once per month.
 */
function isMonthDayDueOnDay(monthDays: readonly number[], dateKey: string): boolean {
  const date = parseDateKey(dateKey);
  const dayOfMonth = date.getDate();
  const lastDayOfMonth = endOfMonth(date).getDate();
  return monthDays.some((day) => (day > lastDayOfMonth ? dayOfMonth === lastDayOfMonth : dayOfMonth === day));
}

/**
 * The two schedules that pick fixed calendar days, and so are due purely as a
 * function of the day — completion history never moves their next occurrence.
 */
function isCalendarSchedule(scheduleType: HabitScheduleType): scheduleType is "weekdays" | "monthDays" {
  return scheduleType === "weekdays" || scheduleType === "monthDays";
}

function isCalendarDueOnDay(habit: AgendaHabit, dateKey: string): boolean {
  if (habit.scheduleType === "weekdays") return habit.scheduleWeekdays.includes(getISODay(parseDateKey(dateKey)));
  if (habit.scheduleType === "monthDays") return isMonthDayDueOnDay(habit.scheduleMonthDays, dateKey);
  return false;
}

/** Enough to reach the previous occurrence of any schedule of each kind. */
const OCCURRENCE_LOOKBACK_DAYS = { weekdays: 7, monthDays: 31 } as const;

/**
 * The unfinished past occurrence a calendar-scheduled habit should nag about
 * today, or null when there is none.
 *
 * Unlike `everyNDays`/`weekly`/`monthly`, `weekdays` and `monthDays` habits are
 * pure calendar predicates, so a missed day would otherwise vanish silently.
 * Each occurrence stays overdue until it is completed or the next occurrence
 * arrives and supersedes it — which caps this at one row per habit.
 *
 * Deliberately kept out of `isHabitDueOnDay`: that also feeds the calendar day
 * rings via `getDayHabitProgress`, where a carried-over miss would count as due
 * again on every following day and skew the history.
 */
export function getOverdueHabitOccurrence(
  habit: AgendaHabit,
  todayKey: string,
  entries: HabitEntryValuesByDate | undefined,
  timeZone?: string,
): string | null {
  if (!isCalendarSchedule(habit.scheduleType)) return null;
  // Archiving means "stop showing me this", including past misses.
  if (isHabitArchivedOn(habit, todayKey, timeZone)) return null;
  // Today's own row supersedes any earlier miss.
  if (isCalendarDueOnDay(habit, todayKey)) return null;

  const createdKey = dateKeyOfMs(habit.createdAt, timeZone);
  const today = parseDateKey(todayKey);

  for (let back = 1; back <= OCCURRENCE_LOOKBACK_DAYS[habit.scheduleType]; back += 1) {
    const dateKey = toDateKey(addLocalDays(today, -back));
    // Days before the habit existed are not misses.
    if (dateKey < createdKey) return null;
    if (!isCalendarDueOnDay(habit, dateKey)) continue;
    return isHabitDoneOnDay(habit.target, getEntryValue(entries, dateKey)) ? null : dateKey;
  }
  return null;
}

function isPeriodDueOnDay(
  habit: Pick<AgendaHabit, "target">,
  scheduleType: HabitPeriodScheduleType,
  dateKey: string,
  todayKey: string,
  entries: HabitEntryValuesByDate | undefined,
  valueOnDay: number,
): boolean {
  const [periodStart, periodEnd] = habitPeriodRange(scheduleType, dateKey);
  const periodDone = sumValuesInRange(entries, periodStart, periodEnd) >= habit.target;

  if (dateKey < todayKey) {
    if (valueOnDay > 0) return true;
    return !periodDone && dateKey === periodEnd;
  }

  if (dateKey === todayKey) return true;

  return !periodDone;
}

function isEveryNDaysDueOnDay(
  habit: AgendaHabit,
  dateKey: string,
  entries: HabitEntryValuesByDate | undefined,
  doneOnDay: boolean,
  timeZone?: string,
): boolean {
  if (doneOnDay) return true;

  const n = Math.max(1, habit.scheduleInterval);
  const lastDone = lastDoneDateBefore(habit, entries, dateKey);
  const dueKey =
    lastDone != null ? toDateKey(addLocalDays(parseDateKey(lastDone), n)) : dateKeyOfMs(habit.createdAt, timeZone);

  if (dateKey < dueKey) return false;

  const dayBefore = toDateKey(addLocalDays(parseDateKey(dateKey), -1));
  if (dayBefore >= dueKey && anyDoneInRange(habit, entries, dueKey, dayBefore)) return false;
  return true;
}

export function habitBucket(timeOfDay: HabitTimeOfDay): Exclude<AgendaBucket, "overdue"> {
  return timeOfDay ?? "anytime";
}

export function taskBucket(
  task: Pick<AgendaTask, "dueAt" | "hasDueTime">,
  timeZone?: string,
): Exclude<AgendaBucket, "overdue"> {
  if (!task.hasDueTime || task.dueAt == null) return "anytime";
  const hour = timeZone ? hourInZone(task.dueAt, timeZone) : new Date(task.dueAt).getHours();
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 20) return "evening";
  return "night";
}

export function isTaskOnLocalDay(dueAt: number, dateKey: string, timeZone?: string): boolean {
  return dateKeyOfMs(dueAt, timeZone) === dateKey;
}

export function isTaskOverdueForToday(
  task: Pick<AgendaTask, "dueAt" | "completedAt">,
  todayKey: string,
  timeZone?: string,
): boolean {
  if (task.dueAt == null || task.completedAt != null) return false;
  const todayStart = timeZone ? zonedMidnightMs(todayKey, timeZone) : localMidnightMs(parseDateKey(todayKey));
  return task.dueAt < todayStart;
}

export function dayHasIncompleteTasks(tasks: readonly AgendaTask[], dateKey: string): boolean {
  return tasks.some((task) => task.dueAt != null && task.completedAt == null && isTaskOnLocalDay(task.dueAt, dateKey));
}

export type DayHabitProgress = {
  due: number;
  done: number;
};

export function getDayHabitProgress(
  habits: readonly AgendaHabit[],
  dateKey: string,
  todayKey: string,
  entriesByHabit: ReadonlyMap<string, HabitEntryValuesByDate>,
): DayHabitProgress {
  let due = 0;
  let done = 0;
  for (const habit of habits) {
    if (!isHabitDueOnDay(habit, dateKey, todayKey, entriesByHabit.get(habit.id))) continue;
    due += 1;
    const value = getHabitProgressValue(habit, dateKey, entriesByHabit.get(habit.id));
    if (isHabitDoneOnDay(habit.target, value)) done += 1;
  }
  return { due, done };
}

/**
 * The one habit ordering, for every habit list and the agenda on both apps: manual order,
 * then oldest first, then id so ties never depend on query order.
 */
export function compareHabits(
  a: { order: number; createdAt: number; id: string },
  b: { order: number; createdAt: number; id: string },
): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareAgendaRows(a: AgendaRow, b: AgendaRow): number {
  if (a.kind === "task" ? a.completed : a.done) {
    if (!(b.kind === "task" ? b.completed : b.done)) return 1;
  } else if (b.kind === "task" ? b.completed : b.done) {
    return -1;
  }

  const rank = (row: AgendaRow) => {
    if (row.kind === "task") return row.sortTime != null ? 0 : 1;
    return 2;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;

  if (a.kind === "task" && b.kind === "task") {
    const ta = a.sortTime ?? 0;
    const tb = b.sortTime ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.task.order ?? 0) - (b.task.order ?? 0);
  }

  if (a.kind === "habit" && b.kind === "habit") return compareHabits(a.habit, b.habit);

  return 0;
}

export function buildAgendaSections(args: {
  selectedKey: string;
  todayKey: string;
  tasks: readonly AgendaTask[];
  habits: readonly AgendaHabit[];
  entriesByHabit: ReadonlyMap<string, HabitEntryValuesByDate>;
  /** IANA zone to read timestamps in; the runtime's own zone when omitted. */
  timeZone?: string;
}): AgendaSection[] {
  const { selectedKey, todayKey, tasks, habits, entriesByHabit, timeZone } = args;
  const isToday = selectedKey === todayKey;
  const isFuture = selectedKey > todayKey;

  const rowsByBucket: Record<AgendaBucket, AgendaRow[]> = {
    overdue: [],
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
    anytime: [],
  };

  for (const task of tasks) {
    if (task.dueAt == null) continue;

    if (isToday && isTaskOverdueForToday(task, todayKey, timeZone)) {
      rowsByBucket.overdue.push({
        kind: "task",
        id: task.id,
        task,
        bucket: "overdue",
        completed: false,
        sortTime: task.hasDueTime ? task.dueAt : null,
      });
      continue;
    }

    if (!isTaskOnLocalDay(task.dueAt, selectedKey, timeZone)) continue;

    const bucket = taskBucket(task, timeZone);
    rowsByBucket[bucket].push({
      kind: "task",
      id: task.id,
      task,
      bucket,
      completed: task.completedAt != null,
      sortTime: task.hasDueTime ? task.dueAt : null,
    });
  }

  for (const habit of habits) {
    const entries = entriesByHabit.get(habit.id);

    // Like overdue tasks, a missed occurrence only surfaces on today, and stays
    // pinned to the day it was scheduled for so checking it off records there.
    const missedKey = isToday ? getOverdueHabitOccurrence(habit, todayKey, entries, timeZone) : null;
    if (missedKey != null) {
      const missedValue = getEntryValue(entries, missedKey);
      rowsByBucket.overdue.push({
        kind: "habit",
        id: habit.id,
        habit,
        bucket: "overdue",
        dateKey: missedKey,
        value: missedValue,
        dayValue: missedValue,
        done: false,
        editable: true,
      });
    }

    if (!isHabitDueOnDay(habit, selectedKey, todayKey, entries, timeZone)) continue;

    const value = getHabitProgressValue(habit, selectedKey, entries);
    const done = isHabitDoneOnDay(habit.target, value);
    const bucket = habitBucket(habit.timeOfDay);
    rowsByBucket[bucket].push({
      kind: "habit",
      id: habit.id,
      habit,
      bucket,
      dateKey: selectedKey,
      value,
      dayValue: getEntryValue(entries, selectedKey),
      done,
      editable: !isFuture,
    });
  }

  const sections: AgendaSection[] = [];
  for (const bucket of AGENDA_BUCKETS) {
    const rows = rowsByBucket[bucket];
    if (rows.length === 0) continue;
    rows.sort(compareAgendaRows);
    sections.push({
      bucket,
      label: AGENDA_BUCKET_LABELS[bucket],
      rows,
    });
  }
  return sections;
}

function parseDayNumbers(raw: string, max: number): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max);
  } catch {
    return [];
  }
}

export function parseScheduleWeekdays(raw: string): number[] {
  return parseDayNumbers(raw, 7);
}

export function parseScheduleMonthDays(raw: string): number[] {
  return parseDayNumbers(raw, 31);
}

export function toAgendaHabit(
  habit: {
    id: string;
    name: string;
    scheduleType: HabitScheduleType;
    scheduleInterval: number;
    timeOfDay: HabitTimeOfDay;
    target: number;
    unit: string;
    order: number;
    archivedAt: number | null;
    createdAt: number;
  },
  scheduleWeekdays: number[],
  scheduleMonthDays: number[],
): AgendaHabit {
  return {
    id: habit.id,
    name: habit.name,
    scheduleType: habit.scheduleType,
    scheduleInterval: habit.scheduleInterval,
    scheduleWeekdays,
    scheduleMonthDays,
    timeOfDay: habit.timeOfDay,
    target: habit.target,
    unit: habit.unit,
    order: habit.order,
    archivedAt: habit.archivedAt,
    createdAt: habit.createdAt,
  };
}
