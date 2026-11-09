import { format } from "date-fns";
import { type AgendaTask, type AgendaTaskRow, buildAgendaSections, parseDateKey, taskLabel } from "../agenda";
import { scheduledTasksQuery } from "../data/agenda";
import { isCalendarBackedTask } from "../google-calendar/mapping";
import { dateKeyInZone, shiftDateKey, timeInZone, todayDateKeyInZone, zonedMidnightMs } from "../time-zone";
import { readRows, type WidgetDbReader } from "./reader";
import {
  type TodayWidgetDay,
  type TodayWidgetRow,
  type TodayWidgetSnapshot,
  WIDGET_PATHS,
  WIDGET_SNAPSHOT_VERSION,
  type WidgetContext,
} from "./snapshots";

/** Today and tomorrow: the second entry takes over at the next local midnight. */
const DAYS = 2;
const OVERDUE_ROW_LIMIT = 3;
/** More than the tallest layout lists. */
const DAY_ROW_LIMIT = 10;

export type TodayWidgetInputs = { tasks: AgendaTask[] };

function dayKeys(now: number, timeZone: string) {
  const todayKey = todayDateKeyInZone(timeZone, new Date(now));
  return Array.from({ length: DAYS }, (_, index) => shiftDateKey(todayKey, index));
}

export function readTodayWidgetInputs(db: WidgetDbReader, { now, timeZone }: WidgetContext): TodayWidgetInputs {
  const keys = dayKeys(now, timeZone);
  const startMs = zonedMidnightMs(keys[0], timeZone);
  const tasks = readRows(
    db,
    scheduledTasksQuery({
      rangeStartMs: startMs,
      rangeEndMs: zonedMidnightMs(shiftDateKey(keys[keys.length - 1], 1), timeZone),
      // Tomorrow's overdue tasks are today's unfinished ones, already inside the range.
      overdueBeforeMs: startMs,
    }),
  ) as AgendaTask[];
  return { tasks };
}

/** "Nov 5", as the Today tab labels overdue rows. */
function shortDayLabel(ms: number, timeZone: string) {
  return format(parseDateKey(dateKeyInZone(ms, timeZone)), "MMM d");
}

function toWidgetRow(row: AgendaTaskRow, { timeZone, link }: WidgetContext, overdue: boolean): TodayWidgetRow {
  const { task } = row;
  return {
    id: task.id,
    title: taskLabel(task),
    time: task.hasDueTime && task.dueAt != null && !overdue ? timeInZone(task.dueAt, timeZone) : null,
    event: isCalendarBackedTask(task),
    due: overdue && task.dueAt != null ? shortDayLabel(task.dueAt, timeZone) : null,
    url: link(WIDGET_PATHS.task(task.id)),
  };
}

/** One day as Today shows it, without habits: overdue first, then timed rows by time, then all-day. */
function buildDay(dateKey: string, tasks: readonly AgendaTask[], ctx: WidgetContext): TodayWidgetDay {
  const sections = buildAgendaSections({
    selectedKey: dateKey,
    todayKey: dateKey,
    tasks,
    habits: [],
    entriesByHabit: new Map(),
    timeZone: ctx.timeZone,
  });
  const taskRows = (rows: (typeof sections)[number]["rows"]) =>
    rows.filter((row): row is AgendaTaskRow => row.kind === "task");

  const overdue = taskRows(sections.find((section) => section.bucket === "overdue")?.rows ?? []);
  const dayRows = taskRows(sections.filter((section) => section.bucket !== "overdue").flatMap((s) => s.rows));
  const open = dayRows
    .filter((row) => !row.completed)
    .sort((a, b) => {
      // Timed first, by time; then all-day in their manual order.
      if (a.sortTime != null && b.sortTime != null) return a.sortTime - b.sortTime;
      if (a.sortTime != null) return -1;
      if (b.sortTime != null) return 1;
      return (a.task.order ?? 0) - (b.task.order ?? 0);
    });
  overdue.sort((a, b) => (a.task.dueAt ?? 0) - (b.task.dueAt ?? 0));

  return {
    dateKey,
    startsAt: zonedMidnightMs(dateKey, ctx.timeZone),
    title: format(parseDateKey(dateKey), "EEEE, MMMM d"),
    overdue: {
      count: overdue.length,
      rows: overdue.slice(0, OVERDUE_ROW_LIMIT).map((row) => toWidgetRow(row, ctx, true)),
    },
    rows: open.slice(0, DAY_ROW_LIMIT).map((row) => toWidgetRow(row, ctx, false)),
    remaining: open.length,
    done: dayRows.length - open.length,
    total: dayRows.length,
  };
}

export function buildTodayWidgetSnapshot({ tasks }: TodayWidgetInputs, ctx: WidgetContext): TodayWidgetSnapshot {
  return {
    v: WIDGET_SNAPSHOT_VERSION,
    kind: "today",
    state: "ok",
    writtenAt: ctx.now,
    links: {
      open: ctx.link(WIDGET_PATHS.open),
      today: ctx.link(WIDGET_PATHS.today),
      newTask: ctx.link(WIDGET_PATHS.newTask),
    },
    days: dayKeys(ctx.now, ctx.timeZone).map((dateKey) => buildDay(dateKey, tasks, ctx)),
  };
}
