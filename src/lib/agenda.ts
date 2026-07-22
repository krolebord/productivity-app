import { addDays, endOfMonth, format, getISODay, startOfMonth, startOfWeek } from "date-fns";
import { localMidnightMs } from "./date-time";

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

export type HabitScheduleType = "daily" | "weekly" | "everyNDays" | "weekdays";
export type HabitTimeOfDay = "morning" | "afternoon" | "evening" | "night" | null;

/** Minimal habit shape needed for due-date / agenda logic. */
export type AgendaHabit = {
  id: string;
  name: string;
  scheduleType: HabitScheduleType;
  scheduleInterval: number;
  /** Parsed ISO weekdays 1=Mon..7=Sun. */
  scheduleWeekdays: number[];
  timeOfDay: HabitTimeOfDay;
  target: number;
  unit: string;
  order: number;
  archivedAt: number | null;
  createdAt: number;
};

/** dateKey ("YYYY-MM-DD") → summed entry value for that day. */
export type HabitEntryValuesByDate = ReadonlyMap<string, number>;

export type AgendaTask = {
  id: string;
  title: string;
  content: string;
  dueAt: number | null;
  hasDueTime: boolean;
  completedAt: number | null;
  order: number | null;
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
  bucket: Exclude<AgendaBucket, "overdue">;
  dateKey: string;
  /** Progress toward target: week sum for weekly habits, day value otherwise. */
  value: number;
  /** Value logged on this specific day (what entry edits operate on). */
  dayValue: number;
  done: boolean;
  /** False for future days — no entry controls. */
  editable: boolean;
};

export type AgendaRow = AgendaTaskRow | AgendaHabitRow;

export type AgendaSection = {
  bucket: AgendaBucket;
  label: string;
  rows: AgendaRow[];
};

/** Local calendar day as "YYYY-MM-DD". */
export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Parse a "YYYY-MM-DD" key into a local Date at midnight. */
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday-start week containing `date`. */
export function startOfWeekMonday(date: Date): Date {
  return startOfWeek(startOfLocalDay(date), { weekStartsOn: 1 });
}

/** Seven local midnights Mon–Sun for the week containing `date`. */
export function getWeekDays(date: Date): Date[] {
  const start = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** All days of the Mon-start week grid covering `date`'s month (4–6 full weeks). */
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
export function isHabitArchivedOn(habit: Pick<AgendaHabit, "archivedAt">, dateKey: string): boolean {
  if (habit.archivedAt == null) return false;
  return toDateKey(new Date(habit.archivedAt)) <= dateKey;
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

function weekDateKeys(dateKey: string): string[] {
  return getWeekDays(parseDateKey(dateKey)).map(toDateKey);
}

/**
 * Progress value shown for a habit on a day: weekly habits accumulate their
 * target over the Mon–Sun week containing the day; others count per day.
 */
export function getHabitProgressValue(
  habit: Pick<AgendaHabit, "scheduleType">,
  dateKey: string,
  entries: HabitEntryValuesByDate | undefined,
): number {
  if (habit.scheduleType !== "weekly") return getEntryValue(entries, dateKey);
  const keys = weekDateKeys(dateKey);
  return sumValuesInRange(entries, keys[0] ?? dateKey, keys[6] ?? dateKey);
}

/**
 * Whether a habit should appear on local day `dateKey`.
 *
 * @param todayKey - "today" in local TZ; used to distinguish past vs current/future weekly rules.
 */
export function isHabitDueOnDay(
  habit: AgendaHabit,
  dateKey: string,
  todayKey: string,
  entries: HabitEntryValuesByDate | undefined,
): boolean {
  const valueOnDay = getEntryValue(entries, dateKey);
  if (isHabitArchivedOn(habit, dateKey) && valueOnDay <= 0) return false;

  const doneOnDay = isHabitDoneOnDay(habit.target, valueOnDay);

  switch (habit.scheduleType) {
    case "daily":
      return true;

    case "weekdays": {
      const weekday = getISODay(parseDateKey(dateKey));
      return habit.scheduleWeekdays.includes(weekday);
    }

    case "weekly":
      return isWeeklyDueOnDay(habit, dateKey, todayKey, entries, valueOnDay);

    case "everyNDays":
      return isEveryNDaysDueOnDay(habit, dateKey, entries, doneOnDay);

    default:
      return false;
  }
}

function isWeeklyDueOnDay(
  habit: Pick<AgendaHabit, "target">,
  dateKey: string,
  todayKey: string,
  entries: HabitEntryValuesByDate | undefined,
  valueOnDay: number,
): boolean {
  const keys = weekDateKeys(dateKey);
  const weekStart = keys[0] ?? dateKey;
  const weekEnd = keys[6] ?? dateKey;
  const weekDone = sumValuesInRange(entries, weekStart, weekEnd) >= habit.target;

  if (dateKey < todayKey) {
    // Past day: show days that logged progress, or missed on the week's last day.
    if (valueOnDay > 0) return true;
    return !weekDone && dateKey === weekEnd;
  }

  // Today stays visible all week, shown as done once the week's sum hits target.
  if (dateKey === todayKey) return true;

  // Future days show until the week is complete.
  return !weekDone;
}

function isEveryNDaysDueOnDay(
  habit: AgendaHabit,
  dateKey: string,
  entries: HabitEntryValuesByDate | undefined,
  doneOnDay: boolean,
): boolean {
  if (doneOnDay) return true;

  const n = Math.max(1, habit.scheduleInterval);
  const lastDone = lastDoneDateBefore(habit, entries, dateKey);
  const dueKey =
    lastDone != null ? toDateKey(addLocalDays(parseDateKey(lastDone), n)) : toDateKey(new Date(habit.createdAt));

  if (dateKey < dueKey) return false;

  // Shown until done: hide if any day in [dueKey, day before D] is done.
  const dayBefore = toDateKey(addLocalDays(parseDateKey(dateKey), -1));
  if (dayBefore >= dueKey && anyDoneInRange(habit, entries, dueKey, dayBefore)) return false;
  return true;
}

export function habitBucket(timeOfDay: HabitTimeOfDay): Exclude<AgendaBucket, "overdue"> {
  return timeOfDay ?? "anytime";
}

/** Timed tasks by hour; all-day → anytime. */
export function taskBucket(task: Pick<AgendaTask, "dueAt" | "hasDueTime">): Exclude<AgendaBucket, "overdue"> {
  if (!task.hasDueTime || task.dueAt == null) return "anytime";
  const hour = new Date(task.dueAt).getHours();
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 20) return "evening";
  return "night";
}

export function isTaskOnLocalDay(dueAt: number, dateKey: string): boolean {
  return toDateKey(new Date(dueAt)) === dateKey;
}

export function isTaskOverdueForToday(task: Pick<AgendaTask, "dueAt" | "completedAt">, todayKey: string): boolean {
  if (task.dueAt == null || task.completedAt != null) return false;
  const todayStart = localMidnightMs(parseDateKey(todayKey));
  return task.dueAt < todayStart;
}

/** Incomplete scheduled tasks on `dateKey` (for week-strip dots). */
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

function compareAgendaRows(a: AgendaRow, b: AgendaRow): number {
  // Incomplete first, completed at bottom.
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

  if (a.kind === "habit" && b.kind === "habit") {
    if (a.habit.order !== b.habit.order) return a.habit.order - b.habit.order;
    return a.habit.name.localeCompare(b.habit.name);
  }

  return 0;
}

/**
 * Build agenda sections for `selectedKey`.
 * Overdue appears only when `selectedKey === todayKey`.
 */
export function buildAgendaSections(args: {
  selectedKey: string;
  todayKey: string;
  tasks: readonly AgendaTask[];
  habits: readonly AgendaHabit[];
  entriesByHabit: ReadonlyMap<string, HabitEntryValuesByDate>;
}): AgendaSection[] {
  const { selectedKey, todayKey, tasks, habits, entriesByHabit } = args;
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

    if (isToday && isTaskOverdueForToday(task, todayKey)) {
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

    if (!isTaskOnLocalDay(task.dueAt, selectedKey)) continue;

    const bucket = taskBucket(task);
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
    if (!isHabitDueOnDay(habit, selectedKey, todayKey, entries)) continue;

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
): AgendaHabit {
  return {
    id: habit.id,
    name: habit.name,
    scheduleType: habit.scheduleType,
    scheduleInterval: habit.scheduleInterval,
    scheduleWeekdays,
    timeOfDay: habit.timeOfDay,
    target: habit.target,
    unit: habit.unit,
    order: habit.order,
    archivedAt: habit.archivedAt,
    createdAt: habit.createdAt,
  };
}
