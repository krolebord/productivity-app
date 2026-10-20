import {
  type AgendaRow,
  type AgendaTask,
  buildAgendaSections,
  type HabitEntryValuesByDate,
  habitTargetPeriodLabel,
  parseDateKey,
  parseScheduleMonthDays,
  parseScheduleWeekdays,
  toAgendaHabit,
  toDateKey,
} from "@productivity/core/agenda";
import { DASHBOARD_SETTINGS_ID } from "@productivity/core/dashboard-settings-defaults";
import { GOOGLE_CALENDAR_PROVIDER_TYPE } from "@productivity/core/google-calendar/types";
import { normalizeTag, parseTags, serializeTags } from "@productivity/core/tags";
import {
  dateKeyInZone,
  isValidTimeZone,
  shiftDateKey,
  timeInZone,
  todayDateKeyInZone,
  zonedMidnightMs,
  zonedTimeMs,
} from "@productivity/core/time-zone";
import type { UserSyncDbSchema } from "@productivity/core/user-db/migrations";
import type { ServerSyncDb } from "@sqlite-sync/cloudflare";
import { generateId } from "@sqlite-sync/core";
import { endOfMonth, endOfWeek, format } from "date-fns";
import { z } from "zod";

type SyncDb = ServerSyncDb<UserSyncDbSchema>;

const MAX_AGENDA_DAYS = 14;
const INBOX_LIMIT = 50;
const CONTENT_PREVIEW_CHARS = 200;

const dateKeyInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use "YYYY-MM-DD".')
  .refine((key) => shiftDateKey(key, 0) === key, "Not a real calendar date.")
  .describe('Local calendar day, "YYYY-MM-DD".');

const dueInput = z
  .object({
    date: dateKeyInput,
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour "HH:mm".')
      .optional()
      .describe('Local time, 24-hour "HH:mm". Omit for an all-day task.'),
  })
  .describe("When the task is scheduled, in the user's timezone.");

const timeZoneInput = z
  .string()
  .optional()
  .describe('IANA timezone such as "Europe/Kyiv". Defaults to the timezone of the user\'s device.');

const tagsInput = z.array(z.string()).describe('Tags such as "work" or "side-project". Normalized to lowercase.');

export const getAgendaInput = z.object({
  date: dateKeyInput.optional().describe('First day, "YYYY-MM-DD". Defaults to today.'),
  days: z.number().int().min(1).max(MAX_AGENDA_DAYS).default(1).describe(`Number of days, 1–${MAX_AGENDA_DAYS}.`),
  timeZone: timeZoneInput,
});

export const createTaskInput = z.object({
  title: z.string().trim().min(1),
  content: z.string().optional().describe("Markdown body."),
  tags: tagsInput.optional(),
  due: dueInput.optional().describe("Omit to put the task in the Inbox."),
  timeZone: timeZoneInput,
});

export const updateTaskInput = z.object({
  id: z.string().min(1).describe("Task id, e.g. from getAgenda."),
  title: z.string().trim().min(1).optional(),
  content: z.string().optional().describe("Replaces the whole markdown body."),
  due: dueInput.nullable().optional().describe("New schedule; null moves the task to the Inbox."),
  completed: z.boolean().optional(),
  addTags: tagsInput.optional(),
  removeTags: tagsInput.optional(),
  timeZone: timeZoneInput,
});

export type GetAgendaInput = z.infer<typeof getAgendaInput>;
export type CreateTaskInput = z.infer<typeof createTaskInput>;
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export type TaskOperationError = { error: string };

class TaskOperationFailure extends Error {}

function fail(message: string): never {
  throw new TaskOperationFailure(message);
}

/** Turns expected failures into `{ error }` results the agent can act on; anything else still throws. */
export function runTaskOperation<T>(operation: () => T): T | TaskOperationError {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TaskOperationFailure) {
      return { error: error.message };
    }
    throw error;
  }
}

function storedTimeZone(syncDb: SyncDb): string | null {
  const [row] = syncDb.executeKysely((q) =>
    q.selectFrom("dashboard_settings").select("timeZone").where("id", "=", DASHBOARD_SETTINGS_ID),
  ).rows;
  return row?.timeZone && isValidTimeZone(row.timeZone) ? row.timeZone : null;
}

/** The zone dates are read and written in: the caller's, else the user's device zone. */
function resolveTimeZone(syncDb: SyncDb, requested: string | undefined): string | null {
  if (requested) {
    if (!isValidTimeZone(requested)) {
      fail(`Unknown timeZone "${requested}". Use an IANA name such as "Europe/Kyiv".`);
    }
    return requested;
  }
  return storedTimeZone(syncDb);
}

function requireTimeZone(timeZone: string | null): string {
  if (!timeZone) {
    fail(
      'The user\'s timezone is not known yet (it is recorded when they open the app). Pass timeZone, e.g. "Europe/Kyiv".',
    );
  }
  return timeZone;
}

function formatDue(dueAt: number | null, hasDueTime: boolean, timeZone: string): string | null {
  if (dueAt == null) return null;
  const date = dateKeyInZone(dueAt, timeZone);
  return hasDueTime ? `${date} ${timeInZone(dueAt, timeZone)}` : date;
}

function dueToFields(due: NonNullable<CreateTaskInput["due"]>, timeZone: string) {
  if (!due.time) {
    return { dueAt: zonedMidnightMs(due.date, timeZone), hasDueTime: false };
  }
  const [hours, minutes] = due.time.split(":").map(Number);
  return { dueAt: zonedTimeMs(due.date, hours ?? 0, minutes ?? 0, timeZone), hasDueTime: true };
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

function contentPreview(content: string | null): string | undefined {
  const trimmed = content?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > CONTENT_PREVIEW_CHARS ? `${trimmed.slice(0, CONTENT_PREVIEW_CHARS)}…` : trimmed;
}

function isCalendarBacked(providerType: string | null): boolean {
  return providerType === GOOGLE_CALENDAR_PROVIDER_TYPE;
}

function summarizeTask(
  task: Pick<AgendaTask, "id" | "title" | "dueAt" | "hasDueTime" | "completedAt"> & { tags: string },
  timeZone: string | null,
) {
  const zone = timeZone ?? "UTC";
  return {
    id: task.id,
    title: task.title,
    due: formatDue(task.dueAt, task.hasDueTime, zone),
    ...(task.dueAt != null ? { timeZone: zone } : {}),
    completed: task.completedAt != null,
    tags: parseTags(task.tags),
  };
}

function formatAgendaRow(row: AgendaRow, timeZone: string) {
  if (row.kind === "task") {
    return {
      type: "task" as const,
      id: row.task.id,
      title: row.task.title,
      due: formatDue(row.task.dueAt, row.task.hasDueTime, timeZone),
      completed: row.completed,
      ...(isCalendarBacked(row.task.providerType) ? { fromGoogleCalendar: true } : {}),
      ...(contentPreview(row.task.content) ? { contentPreview: contentPreview(row.task.content) } : {}),
    };
  }
  return {
    type: "habit" as const,
    id: row.habit.id,
    name: row.habit.name,
    date: row.dateKey,
    progress: row.value,
    target: row.habit.target,
    ...(row.habit.unit ? { unit: row.habit.unit } : {}),
    per: habitTargetPeriodLabel(row.habit.scheduleType),
    done: row.done,
  };
}

const AGENDA_TASK_COLUMNS = [
  "id",
  "title",
  "content",
  "dueAt",
  "hasDueTime",
  "completedAt",
  "order",
  "providerType",
] as const;

export function getAgenda(syncDb: SyncDb, input: GetAgendaInput) {
  const timeZone = requireTimeZone(resolveTimeZone(syncDb, input.timeZone));
  const todayKey = todayDateKeyInZone(timeZone);
  const dayKeys = Array.from({ length: input.days }, (_, i) => shiftDateKey(input.date ?? todayKey, i));
  const lastKey = dayKeys[dayKeys.length - 1] ?? todayKey;

  const rangeStartMs = zonedMidnightMs(dayKeys[0] ?? todayKey, timeZone);
  const rangeEndMs = zonedMidnightMs(shiftDateKey(lastKey, 1), timeZone);
  const todayStartMs = zonedMidnightMs(todayKey, timeZone);

  // Mirrors the Today view: the requested days plus anything still open from before today.
  const tasks = syncDb.executeKysely((q) =>
    q
      .selectFrom("item")
      .select(AGENDA_TASK_COLUMNS)
      .where("dueAt", "is not", null)
      .where((eb) =>
        eb.or([
          eb.and([eb("dueAt", ">=", rangeStartMs), eb("dueAt", "<", rangeEndMs)]),
          eb.and([eb("dueAt", "<", todayStartMs), eb("completedAt", "is", null)]),
        ]),
      ),
  ).rows as AgendaTask[];

  const habits = syncDb
    .executeKysely((q) => q.selectFrom("habit").selectAll().orderBy("order", "asc"))
    .rows.map((habit) =>
      toAgendaHabit(
        habit,
        parseScheduleWeekdays(habit.scheduleWeekdays),
        parseScheduleMonthDays(habit.scheduleMonthDays),
      ),
    );

  const lastDate = parseDateKey(lastKey);
  const entriesEndKey = toDateKey(
    new Date(Math.max(endOfMonth(lastDate).getTime(), endOfWeek(lastDate, { weekStartsOn: 1 }).getTime())),
  );
  const entries = syncDb.executeKysely((q) =>
    q.selectFrom("habit_entry").select(["habitId", "date", "value"]).where("date", "<=", entriesEndKey),
  ).rows;
  const entriesByHabit = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    let byDate = entriesByHabit.get(entry.habitId);
    if (!byDate) {
      byDate = new Map();
      entriesByHabit.set(entry.habitId, byDate);
    }
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.value);
  }

  const days = dayKeys.map((dateKey) => ({
    date: dateKey,
    weekday: format(parseDateKey(dateKey), "EEEE"),
    sections: buildAgendaSections({
      selectedKey: dateKey,
      todayKey,
      tasks,
      habits,
      entriesByHabit: entriesByHabit as ReadonlyMap<string, HabitEntryValuesByDate>,
      timeZone,
    }).map((section) => ({
      section: section.label,
      items: section.rows.map((row) => formatAgendaRow(row, timeZone)),
    })),
  }));

  const inboxRows = syncDb.executeKysely((q) =>
    q
      .selectFrom("item")
      .select(["id", "title", "content", "tags"])
      .where("type", "=", "task")
      .where("dueAt", "is", null)
      .where("completedAt", "is", null)
      .orderBy("order", "asc")
      .orderBy("createdAt", "asc")
      .limit(INBOX_LIMIT + 1),
  ).rows;

  return {
    timeZone,
    today: todayKey,
    days,
    inbox: inboxRows.slice(0, INBOX_LIMIT).map((task) => ({
      id: task.id,
      title: task.title,
      ...(contentPreview(task.content) ? { contentPreview: contentPreview(task.content) } : {}),
    })),
    ...(inboxRows.length > INBOX_LIMIT ? { inboxTruncated: true } : {}),
  };
}

export function createTask(syncDb: SyncDb, input: CreateTaskInput) {
  const timeZone = resolveTimeZone(syncDb, input.timeZone);
  const due = input.due ? dueToFields(input.due, requireTimeZone(timeZone)) : { dueAt: null, hasDueTime: false };

  const [maxOrderRow] = syncDb.executeKysely((q) =>
    q
      .selectFrom("item")
      .select((eb) => eb.fn.max("order").as("maxOrder"))
      .where("type", "=", "task"),
  ).rows;

  const id = generateId();
  const task = {
    id,
    type: "task" as const,
    title: input.title,
    content: input.content ?? "",
    tags: serializeTags(normalizeTags(input.tags ?? [])),
    dueAt: due.dueAt,
    hasDueTime: due.hasDueTime,
    completedAt: null,
    order: Number(maxOrderRow?.maxOrder ?? 0) + 1,
    createdAt: Date.now(),
    providerType: null,
    providerId: null,
    providerUpdatedAt: null,
  };
  syncDb.applyEvent({ type: "item-created", dataset: "_item", item_id: id, payload: task });

  return summarizeTask(task, timeZone);
}

export function updateTask(syncDb: SyncDb, input: UpdateTaskInput) {
  const [task] = syncDb.executeKysely((q) =>
    q
      .selectFrom("item")
      .select(["id", "type", "title", "tags", "dueAt", "hasDueTime", "completedAt", "providerType"])
      .where("id", "=", input.id),
  ).rows;
  if (!task) {
    fail(`No task with id "${input.id}". Use getAgenda or queryDb to find task ids.`);
  }
  if (task.type !== "task" && task.dueAt == null) {
    fail(`"${task.title}" is a note, not a task.`);
  }

  const editsEventFields = input.title !== undefined || input.content !== undefined || input.due !== undefined;
  if (editsEventFields && isCalendarBacked(task.providerType)) {
    fail(
      `"${task.title}" mirrors a Google Calendar event, so its title, content, and schedule come from the event and would be overwritten on the next sync. Change the event in Google Calendar instead; completion and tags can still be changed here.`,
    );
  }

  const timeZone = resolveTimeZone(syncDb, input.timeZone);
  const patch: {
    type?: "task";
    title?: string;
    content?: string;
    dueAt?: number | null;
    hasDueTime?: boolean;
    completedAt?: number | null;
    tags?: string;
  } = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.content !== undefined) patch.content = input.content;
  if (input.due === null) {
    patch.type = "task";
    patch.dueAt = null;
    patch.hasDueTime = false;
  } else if (input.due) {
    Object.assign(patch, dueToFields(input.due, requireTimeZone(timeZone)));
  }

  if (input.completed === true && task.completedAt == null) {
    patch.completedAt = Date.now();
    // Like the Today view, completing an Inbox task files it under the day it was done.
    if (("dueAt" in patch ? patch.dueAt : task.dueAt) == null) {
      const zone = requireTimeZone(timeZone);
      patch.dueAt = zonedMidnightMs(todayDateKeyInZone(zone), zone);
      patch.hasDueTime = false;
    }
  } else if (input.completed === false) {
    patch.completedAt = null;
  }

  if (input.addTags || input.removeTags) {
    const remove = new Set(normalizeTags(input.removeTags ?? []));
    const tags = normalizeTags([...parseTags(task.tags), ...(input.addTags ?? [])]).filter((tag) => !remove.has(tag));
    patch.tags = serializeTags(tags);
  }

  if (Object.keys(patch).length === 0 && input.completed === undefined) {
    fail("Nothing to change. Pass at least one of title, content, due, completed, addTags, or removeTags.");
  }

  if (Object.keys(patch).length > 0) {
    syncDb.applyEvent({ type: "item-updated", dataset: "_item", item_id: task.id, payload: patch });
  }

  return summarizeTask({ ...task, ...patch }, timeZone);
}
