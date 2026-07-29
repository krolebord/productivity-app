import { describe, expect, it } from "vitest";
import {
  buildEventContent,
  CALENDAR_CLEANUP_PROVIDER_TYPE,
  DETACHED_PROVIDER_TYPE,
  decideEventSync,
  type ExistingSyncedTask,
  mapEventToTaskFields,
  zonedMidnightMs,
} from "./mapping";
import { buildEventProviderId, type GoogleCalendarEvent } from "./types";

const KYIV = "Europe/Kyiv";

function event(overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id: "evt",
    status: "confirmed",
    summary: "Standup",
    description: "",
    location: "",
    htmlLink: "https://calendar.google.com/event?eid=abc",
    updated: "2026-07-20T10:00:00.000Z",
    start: { dateTime: "2026-08-03T09:30:00+03:00" },
    end: { dateTime: "2026-08-03T10:00:00+03:00" },
    ...overrides,
  };
}

const WINDOW_START = Date.parse("2026-07-28T00:00:00Z");
const WINDOW_END = Date.parse("2026-08-12T00:00:00Z");

function decide(args: { event: GoogleCalendarEvent; existing?: ExistingSyncedTask }) {
  return decideEventSync({
    event: args.event,
    existing: args.existing,
    timeZone: KYIV,
    windowStartMs: WINDOW_START,
    windowEndMs: WINDOW_END,
  });
}

function existingTask(overrides: Partial<ExistingSyncedTask> = {}): ExistingSyncedTask {
  return {
    id: "item-1",
    tombstone: false,
    providerType: "google-calendar",
    providerUpdatedAt: Date.parse("2026-07-20T10:00:00.000Z"),
    completedAt: null,
    dueAt: Date.parse("2026-08-03T09:30:00+03:00"),
    ...overrides,
  };
}

describe("zonedMidnightMs", () => {
  it("anchors an all-day date to midnight in the calendar's zone, not UTC", () => {
    // Kyiv is UTC+3 in August, so local midnight is 21:00 UTC the previous day.
    expect(zonedMidnightMs("2026-08-03", KYIV)).toBe(Date.parse("2026-08-02T21:00:00Z"));
  });

  it("keeps all-day events on the right day west of UTC", () => {
    // The bug this guards: UTC midnight would render as the previous evening in New York.
    const ms = zonedMidnightMs("2026-08-03", "America/New_York");
    expect(ms).toBe(Date.parse("2026-08-03T04:00:00Z"));
    const dayInZone = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
    expect(dayInZone).toBe("2026-08-03");
  });

  it("resolves dates on the far side of a DST transition", () => {
    // Kyiv switches to UTC+2 in late October.
    expect(zonedMidnightMs("2026-11-10", KYIV)).toBe(Date.parse("2026-11-09T22:00:00Z"));
  });
});

describe("mapEventToTaskFields", () => {
  it("maps a timed event to a timed task", () => {
    const fields = mapEventToTaskFields(event(), KYIV);
    expect(fields).not.toBeNull();
    expect(fields?.title).toBe("Standup");
    expect(fields?.hasDueTime).toBe(true);
    expect(fields?.dueAt).toBe(Date.parse("2026-08-03T09:30:00+03:00"));
    expect(fields?.providerUpdatedAt).toBe(Date.parse("2026-07-20T10:00:00.000Z"));
  });

  it("maps an all-day event to an all-day task", () => {
    const fields = mapEventToTaskFields(event({ start: { date: "2026-08-03" }, end: { date: "2026-08-04" } }), KYIV);
    expect(fields?.hasDueTime).toBe(false);
    expect(fields?.dueAt).toBe(zonedMidnightMs("2026-08-03", KYIV));
  });

  it("falls back to a placeholder title for untitled events", () => {
    expect(mapEventToTaskFields(event({ summary: "   " }), KYIV)?.title).toBe("(no title)");
  });

  it("returns null when the event has no usable start", () => {
    expect(mapEventToTaskFields(event({ start: undefined }), KYIV)).toBeNull();
    expect(mapEventToTaskFields(event({ start: {} }), KYIV)).toBeNull();
  });

  it("prefers the event's own timezone over the calendar default", () => {
    const fields = mapEventToTaskFields(
      event({ start: { date: "2026-08-03", timeZone: "America/New_York" }, end: { date: "2026-08-04" } }),
      KYIV,
    );
    expect(fields?.dueAt).toBe(zonedMidnightMs("2026-08-03", "America/New_York"));
  });
});

describe("buildEventContent", () => {
  it("includes the time range, location and link", () => {
    const content = buildEventContent(event({ location: "Office" }), KYIV);
    expect(content).toContain("09:30–10:00");
    expect(content).toContain("Office");
    expect(content).toContain("https://calendar.google.com/event?eid=abc");
  });

  it("labels a single all-day event without a date range", () => {
    const content = buildEventContent(event({ start: { date: "2026-08-03" }, end: { date: "2026-08-04" } }), KYIV);
    expect(content).toContain("All day");
    expect(content).not.toContain("–");
  });

  it("shows an inclusive range for multi-day all-day events", () => {
    // Google's end.date is exclusive: Aug 3–5 arrives as end 2026-08-06.
    const content = buildEventContent(event({ start: { date: "2026-08-03" }, end: { date: "2026-08-06" } }), KYIV);
    expect(content).toContain("Aug 3 – Aug 5");
  });

  it("subtracts an exclusive all-day end in date space across spring DST", () => {
    const content = buildEventContent(
      event({ start: { date: "2026-03-08" }, end: { date: "2026-03-09" } }),
      "America/New_York",
    );
    expect(content).toContain("All day");
    expect(content).not.toContain("Mar 8 – Mar 7");
  });

  it("spells out the end date when a timed event crosses midnight", () => {
    const content = buildEventContent(
      event({ start: { dateTime: "2026-08-03T23:00:00+03:00" }, end: { dateTime: "2026-08-04T01:00:00+03:00" } }),
      KYIV,
    );
    expect(content).toContain("23:00–Aug 4 01:00");
  });
});

describe("decideEventSync", () => {
  it("creates a task for a new event in the window", () => {
    const decision = decide({ event: event() });
    expect(decision.action).toBe("create");
  });

  it("never recreates a task the user deleted", () => {
    const decision = decide({ event: event(), existing: existingTask({ tombstone: true }) });
    expect(decision).toEqual({ action: "skip", reason: "deleted-locally" });
  });

  it("restores a tombstone created by integration cleanup", () => {
    const decision = decide({
      event: event(),
      existing: existingTask({ tombstone: true, providerType: CALENDAR_CLEANUP_PROVIDER_TYPE }),
    });
    expect(decision.action).toBe("restore");
    if (decision.action === "restore") {
      expect(decision.itemId).toBe("item-1");
      expect(decision.fields.title).toBe("Standup");
    }
  });

  it("leaves detached tasks alone even when the event changed", () => {
    const decision = decide({
      event: event({ summary: "Renamed", updated: "2026-07-25T10:00:00.000Z" }),
      existing: existingTask({ providerType: DETACHED_PROVIDER_TYPE }),
    });
    expect(decision).toEqual({ action: "skip", reason: "detached" });
  });

  it("skips an unchanged event so resyncs do not rewrite rows", () => {
    const decision = decide({ event: event(), existing: existingTask() });
    expect(decision).toEqual({ action: "skip", reason: "unchanged" });
  });

  it("updates when the event's updated timestamp advances", () => {
    const decision = decide({
      event: event({ summary: "Standup (moved)", updated: "2026-07-26T08:00:00.000Z" }),
      existing: existingTask(),
    });
    expect(decision.action).toBe("update");
    if (decision.action === "update") {
      expect(decision.itemId).toBe("item-1");
      expect(decision.fields.title).toBe("Standup (moved)");
    }
  });

  it("updates a row that has never recorded a provider timestamp", () => {
    const decision = decide({ event: event(), existing: existingTask({ providerUpdatedAt: null }) });
    expect(decision.action).toBe("update");
  });

  it("tombstones a cancelled event", () => {
    const decision = decide({ event: event({ status: "cancelled" }), existing: existingTask() });
    expect(decision).toEqual({ action: "tombstone", itemId: "item-1" });
  });

  it("keeps a completed task when its event is cancelled", () => {
    const decision = decide({
      event: event({ status: "cancelled" }),
      existing: existingTask({ completedAt: Date.parse("2026-08-03T10:05:00Z") }),
    });
    expect(decision).toEqual({ action: "skip", reason: "deleted-locally" });
  });

  it("ignores a cancellation for an event that was never imported", () => {
    const decision = decide({ event: event({ status: "cancelled" }) });
    expect(decision).toEqual({ action: "skip", reason: "already-gone" });
  });

  it("does not create tasks for events outside the sync window", () => {
    const decision = decide({
      event: event({
        start: { dateTime: "2026-09-30T09:00:00+03:00" },
        end: { dateTime: "2026-09-30T10:00:00+03:00" },
      }),
    });
    expect(decision).toEqual({ action: "skip", reason: "outside-window" });
  });

  it("leaves an existing task that has aged out of the window untouched", () => {
    const decision = decide({
      event: event({
        start: { dateTime: "2026-06-01T09:00:00+03:00" },
        end: { dateTime: "2026-06-01T10:00:00+03:00" },
        updated: "2026-07-27T10:00:00.000Z",
      }),
      existing: existingTask({ dueAt: Date.parse("2026-06-01T09:00:00+03:00") }),
    });
    expect(decision).toEqual({ action: "skip", reason: "outside-window" });
  });

  it("removes an existing task when its event moves beyond the window", () => {
    const decision = decide({
      event: event({
        start: { dateTime: "2026-09-30T09:00:00+03:00" },
        end: { dateTime: "2026-09-30T10:00:00+03:00" },
        updated: "2026-07-27T10:00:00.000Z",
      }),
      existing: existingTask(),
    });
    expect(decision).toEqual({ action: "remove", itemId: "item-1" });
  });

  it("does not remove an in-window task for an older outside-window event snapshot", () => {
    const decision = decide({
      event: event({
        start: { dateTime: "2026-09-30T09:00:00+03:00" },
        end: { dateTime: "2026-09-30T10:00:00+03:00" },
        updated: "2026-07-19T10:00:00.000Z",
      }),
      existing: existingTask(),
    });
    expect(decision).toEqual({ action: "skip", reason: "unchanged" });
  });

  it("keeps completed history when its event moves beyond the window", () => {
    const decision = decide({
      event: event({
        start: { dateTime: "2026-09-30T09:00:00+03:00" },
        end: { dateTime: "2026-09-30T10:00:00+03:00" },
        updated: "2026-07-27T10:00:00.000Z",
      }),
      existing: existingTask({ completedAt: Date.parse("2026-08-03T10:05:00Z") }),
    });
    expect(decision).toEqual({ action: "skip", reason: "outside-window" });
  });

  it("skips events it cannot place on a day", () => {
    const decision = decide({ event: event({ start: {} }) });
    expect(decision).toEqual({ action: "skip", reason: "unmappable" });
  });
});

describe("buildEventProviderId", () => {
  it("scopes ids by connection and calendar so shared invites stay distinct", () => {
    const first = buildEventProviderId({ providerConnectionId: "conn-1", calendarId: "a@x.com", eventId: "evt" });
    const second = buildEventProviderId({ providerConnectionId: "conn-2", calendarId: "b@y.com", eventId: "evt" });
    expect(first).not.toBe(second);
  });
});
