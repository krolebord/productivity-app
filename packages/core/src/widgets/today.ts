import { format } from "date-fns";
import {
  type AgendaHabit,
  type AgendaTask,
  type AgendaTaskRow,
  buildAgendaSections,
  compareHabits,
  orderTodaySectionRows,
  parseDateKey,
  parseScheduleMonthDays,
  parseScheduleWeekdays,
  taskLabel,
  toAgendaHabit,
} from "../agenda";
import { agendaHabitsQuery, habitEntriesQuery, inboxTasksQuery, scheduledTasksQuery } from "../data/agenda";
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
/** More than the tallest layout lists. */
const DAY_ROW_LIMIT = 10;

export type TodayWidgetInputs = {
  tasks: AgendaTask[];
  inbox?: AgendaTask[];
  habits?: AgendaHabit[];
  entriesByHabit?: ReadonlyMap<string, ReadonlyMap<string, number>>;
};

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
  const inbox = readRows(db, inboxTasksQuery) as AgendaTask[];
  const habits = readRows(db, agendaHabitsQuery)
    .map((h) =>
      toAgendaHabit(h, parseScheduleWeekdays(h.scheduleWeekdays), parseScheduleMonthDays(h.scheduleMonthDays)),
    )
    .sort(compareHabits);
  const entriesByHabit = new Map<string, Map<string, number>>();
  for (const entry of readRows(db, habitEntriesQuery(keys[keys.length - 1]))) {
    const entries = entriesByHabit.get(entry.habitId) ?? new Map<string, number>();
    entries.set(entry.date, (entries.get(entry.date) ?? 0) + entry.value);
    entriesByHabit.set(entry.habitId, entries);
  }
  return { tasks, inbox, habits, entriesByHabit };
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

/**
 * Agenda rows first, in Today order; inbox tasks only fill what the ten-row cap leaves, since
 * they matter less than the day's plan. Progress counts the agenda only.
 */
function buildDay(dateKey: string, inputs: TodayWidgetInputs, ctx: WidgetContext): TodayWidgetDay {
  const sections = buildAgendaSections({
    selectedKey: dateKey,
    todayKey: dateKey,
    tasks: inputs.tasks,
    habits: inputs.habits ?? [],
    entriesByHabit: inputs.entriesByHabit ?? new Map(),
    timeZone: ctx.timeZone,
  });
  const all = sections.flatMap(orderTodaySectionRows);
  const done = all.filter((row) => (row.kind === "task" ? row.completed : row.done)).length;
  const open = all.filter((row) => (row.kind === "task" ? !row.completed : !row.done));
  const rows = open.slice(0, DAY_ROW_LIMIT).map(
    (row): TodayWidgetRow =>
      row.kind === "task"
        ? toWidgetRow(row, ctx, row.bucket === "overdue")
        : {
            id: `habit:${row.id}:${row.dateKey}`,
            title: row.habit.name,
            kind: "habit",
            time: null,
            event: false,
            due: row.bucket === "overdue" ? format(parseDateKey(row.dateKey), "MMM d") : null,
            url: ctx.link(WIDGET_PATHS.today),
          },
  );
  const inbox = inputs.inbox ?? [];
  const inboxRows = inbox
    .slice(0, DAY_ROW_LIMIT - rows.length)
    .map((task) =>
      toWidgetRow({ kind: "task", id: task.id, task, bucket: "anytime", completed: false, sortTime: null }, ctx, false),
    );
  return {
    dateKey,
    startsAt: zonedMidnightMs(dateKey, ctx.timeZone),
    endsAt: zonedMidnightMs(shiftDateKey(dateKey, 1), ctx.timeZone),
    title: format(parseDateKey(dateKey), "EEEE, MMMM d"),
    overdue: { count: 0, rows: [] },
    rows,
    remaining: open.length,
    done,
    total: open.length + done,
    inbox: { count: inbox.length, rows: inboxRows },
  };
}

export function buildTodayWidgetSnapshot(inputs: TodayWidgetInputs, ctx: WidgetContext): TodayWidgetSnapshot {
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
    days: dayKeys(ctx.now, ctx.timeZone).map((dateKey) => buildDay(dateKey, inputs, ctx)),
  };
}
