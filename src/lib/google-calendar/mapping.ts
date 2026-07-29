import {
  GOOGLE_CALENDAR_PROVIDER_TYPE,
  type GoogleCalendarEvent,
  SYNC_WINDOW_FUTURE_DAYS,
  SYNC_WINDOW_PAST_DAYS,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `providerType` of a task the user unlinked from its calendar event.
 *
 * Detached rows keep their `providerId` so the sync job still recognises them and never re-imports
 * the event, but they are otherwise plain local tasks: no icon, no overwrites.
 */
export const DETACHED_PROVIDER_TYPE = "detached" as const;

/** Fields the sync job writes onto an `item` row. Nothing else about the task is touched. */
export type MappedEventFields = {
  title: string;
  content: string;
  dueAt: number;
  hasDueTime: boolean;
  providerUpdatedAt: number | null;
};

/**
 * Offset of `timeZone` from UTC at `instant`, in ms.
 *
 * Derived through `Intl` rather than a date library: the worker runtime has full ICU, and the
 * alternative is another dependency for one conversion.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }

  const asUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );

  return asUtc - instant.getTime();
}

/**
 * Epoch ms of midnight on `dateKey` ("YYYY-MM-DD") in `timeZone`.
 *
 * All-day Google events carry a bare date in the calendar's timezone, so anchoring them to the
 * calendar's midnight (not the worker's UTC midnight) is what keeps them on the right day for
 * users west of UTC. The offset is resolved twice because the first guess can land on the wrong
 * side of a DST transition.
 */
export function zonedMidnightMs(dateKey: string, timeZone: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcMidnight = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);

  let offset = timeZoneOffsetMs(new Date(utcMidnight), timeZone);
  offset = timeZoneOffsetMs(new Date(utcMidnight - offset), timeZone);

  return utcMidnight - offset;
}

/** Today's calendar day in `timeZone`, as "YYYY-MM-DD". */
export function todayDateKeyInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Shift a "YYYY-MM-DD" key by whole days, staying in date space (no timezone involved). */
export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The half-open `[start, end)` range of event start times the job mirrors, anchored to midnights in
 * the calendar's timezone so the boundary does not drift between runs (which would make events at
 * the edge flicker in and out of the task list).
 */
export function syncWindow(timeZone: string, now: Date = new Date()): { startMs: number; endMs: number } {
  const today = todayDateKeyInZone(timeZone, now);
  return {
    startMs: zonedMidnightMs(shiftDateKey(today, -SYNC_WINDOW_PAST_DAYS), timeZone),
    endMs: zonedMidnightMs(shiftDateKey(today, SYNC_WINDOW_FUTURE_DAYS), timeZone),
  };
}

function formatInZone(instant: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(instant);
}

function eventStartMs(event: GoogleCalendarEvent, timeZone: string): number | null {
  const start = event.start;
  if (!start) return null;

  if (start.dateTime) {
    const parsed = Date.parse(start.dateTime);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (start.date) {
    return zonedMidnightMs(start.date, start.timeZone || timeZone);
  }

  return null;
}

/** Human-readable time range for the task body, rendered in the calendar's timezone. */
function formatRange(event: GoogleCalendarEvent, timeZone: string): string {
  const startDateTime = event.start?.dateTime;
  const endDateTime = event.end?.dateTime;

  if (startDateTime && endDateTime) {
    const zone = event.start?.timeZone || timeZone;
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    const timeOptions: Intl.DateTimeFormatOptions = { hourCycle: "h23", hour: "2-digit", minute: "2-digit" };
    const sameDay =
      formatInZone(start, zone, { year: "numeric", month: "2-digit", day: "2-digit" }) ===
      formatInZone(end, zone, { year: "numeric", month: "2-digit", day: "2-digit" });

    const startLabel = formatInZone(start, zone, timeOptions);
    const endLabel = sameDay
      ? formatInZone(end, zone, timeOptions)
      : `${formatInZone(end, zone, { month: "short", day: "numeric" })} ${formatInZone(end, zone, timeOptions)}`;

    return `${startLabel}–${endLabel}`;
  }

  const startDate = event.start?.date;
  const endDate = event.end?.date;
  if (startDate && endDate) {
    // Google's all-day `end.date` is exclusive, so a one-day event ends the next morning.
    const lastDay = new Date(zonedMidnightMs(endDate, timeZone) - 24 * 60 * 60 * 1000);
    const firstDay = new Date(zonedMidnightMs(startDate, timeZone));
    const dateOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const first = formatInZone(firstDay, timeZone, dateOptions);
    const last = formatInZone(lastDay, timeZone, dateOptions);
    return first === last ? "All day" : `All day, ${first} – ${last}`;
  }

  return "";
}

/**
 * Body text for an event-backed task: the details that have no column on `item`.
 *
 * Kept short and regenerated on every change, so anything the user types into the body of a
 * still-attached task is overwritten on the next change to the event.
 */
export function buildEventContent(event: GoogleCalendarEvent, timeZone: string): string {
  const lines: string[] = [];

  const range = formatRange(event, timeZone);
  const meta = [range, event.location].filter((part) => part !== "").join(" · ");
  if (meta !== "") {
    lines.push(meta);
  }

  if (event.htmlLink !== "") {
    lines.push(`[Open in Google Calendar](${event.htmlLink})`);
  }

  const description = event.description.trim();
  if (description !== "") {
    lines.push("", description);
  }

  return lines.join("\n");
}

/**
 * Map a Google event onto the task fields the sync job writes, or null when the event has no
 * usable start (malformed, or a birthday-style entry we cannot place on a day).
 */
export function mapEventToTaskFields(event: GoogleCalendarEvent, timeZone: string): MappedEventFields | null {
  const startMs = eventStartMs(event, timeZone);
  if (startMs == null) return null;

  const updated = event.updated ? Date.parse(event.updated) : Number.NaN;

  return {
    title: event.summary.trim() || "(no title)",
    content: buildEventContent(event, timeZone),
    dueAt: startMs,
    hasDueTime: Boolean(event.start?.dateTime),
    providerUpdatedAt: Number.isFinite(updated) ? updated : null,
  };
}

/** The subset of an existing `item` row the reconciliation rules need. */
export type ExistingSyncedTask = {
  id: string;
  tombstone: boolean;
  providerType: string | null;
  providerUpdatedAt: number | null;
  completedAt: number | null;
};

export type EventSyncDecision =
  | { action: "create"; fields: MappedEventFields }
  | { action: "update"; itemId: string; fields: MappedEventFields }
  | { action: "tombstone"; itemId: string }
  | {
      action: "skip";
      reason: "unmappable" | "deleted-locally" | "detached" | "unchanged" | "outside-window" | "already-gone";
    };

/**
 * Decide what a single incoming event should do to the synced task list.
 *
 * The rules exist to keep a one-way mirror from fighting the user:
 * - a task the user deleted is never recreated (tombstoned rows still match by `providerId`);
 * - a detached task is left alone entirely;
 * - `completedAt` is never written by sync, and completing an event-backed task protects it from
 *   later cancellation so history survives;
 * - events outside the sync window are ignored rather than deleted — incremental responses ignore
 *   `timeMin`/`timeMax`, and tasks that simply aged out of the window are still real history;
 * - otherwise Google wins, but only when the event's `updated` timestamp has advanced, so a
 *   full resync does not rewrite rows on every run.
 */
export function decideEventSync(args: {
  event: GoogleCalendarEvent;
  existing: ExistingSyncedTask | undefined;
  timeZone: string;
  windowStartMs: number;
  windowEndMs: number;
}): EventSyncDecision {
  const { event, existing, timeZone, windowStartMs, windowEndMs } = args;

  if (existing?.providerType === DETACHED_PROVIDER_TYPE) {
    return { action: "skip", reason: "detached" };
  }

  if (existing?.tombstone) {
    return { action: "skip", reason: "deleted-locally" };
  }

  if (event.status === "cancelled") {
    if (!existing) return { action: "skip", reason: "already-gone" };
    if (existing.completedAt != null) return { action: "skip", reason: "deleted-locally" };
    return { action: "tombstone", itemId: existing.id };
  }

  const fields = mapEventToTaskFields(event, timeZone);
  if (!fields) {
    return { action: "skip", reason: "unmappable" };
  }

  if (fields.dueAt < windowStartMs || fields.dueAt >= windowEndMs) {
    return { action: "skip", reason: "outside-window" };
  }

  if (!existing) {
    return { action: "create", fields };
  }

  const seen = existing.providerUpdatedAt;
  if (seen != null && fields.providerUpdatedAt != null && fields.providerUpdatedAt <= seen) {
    return { action: "skip", reason: "unchanged" };
  }

  return { action: "update", itemId: existing.id, fields };
}

/** Whether a task row should show the calendar icon. */
export function isCalendarBackedTask(item: { providerType: string | null }): boolean {
  return item.providerType === GOOGLE_CALENDAR_PROVIDER_TYPE;
}
