import { createWasmMemoryDriver, SQLiteDbWrapper } from "@sqlite-sync/core";
import { beforeEach, describe, expect, it } from "vitest";
import { APP_CURRENCIES } from "../currency/currencies";
import { GOOGLE_CALENDAR_PROVIDER_TYPE } from "../google-calendar/types";
import { zonedMidnightMs, zonedTimeMs } from "../time-zone";
import type { UserDb } from "../user-db/migrations";
import { buildWidgetSnapshots } from "./build";
import { buildFinancesWidgetSnapshot, readFinancesWidgetInputs } from "./finances";
import { buildNotesWidgetSnapshot, NOTES_WIDGET_LIMIT, readNotesWidgetInputs } from "./notes";
import type { WidgetDbReader } from "./reader";
import {
  createWidgetLinker,
  pickTodayWidgetDay,
  signedOutWidgetSnapshot,
  staleTodayWidgetSnapshot,
  todayWidgetExpiresAt,
  type WidgetContext,
  widgetSnapshotHash,
} from "./snapshots";
import { buildTodayWidgetSnapshot, readTodayWidgetInputs } from "./today";

// New York, a week after DST ended (UTC-5): late-evening local times fall on the next UTC day,
// which is what catches a builder reading days in the wrong zone.
const TZ = "America/New_York";
const at = (dateKey: string, hours: number, minutes = 0) => zonedTimeMs(dateKey, hours, minutes, TZ);
const NOW = at("2026-11-09", 15);
const ctx: WidgetContext = { now: NOW, timeZone: TZ, link: createWidgetLinker("productivity") };

// Plain tables standing in for the synced views: the readers only issue ordinary SQL.
async function createTestDb() {
  const db = new SQLiteDbWrapper<UserDb>({ driver: await createWasmMemoryDriver() });
  db.execute(`create table item (
    id text primary key, tombstone integer not null default 0, type text not null default 'note',
    title text not null default '', createdAt integer not null default 0, content text default '',
    "order" real default 0, tags text not null default '[]', dueAt integer, hasDueTime integer not null default 0,
    completedAt integer, providerType text, providerId text, providerUpdatedAt integer
  )`);
  db.execute(`create table habit (
    id text primary key, name text not null, scheduleType text not null default 'daily',
    scheduleInterval integer not null default 1, scheduleWeekdays text not null default '[]',
    scheduleMonthDays text not null default '[]', timeOfDay text, target real not null default 1,
    unit text not null default '', "order" real not null default 0, archivedAt integer,
    createdAt integer not null default 0
  )`);
  db.execute(
    `create table habit_entry (id text primary key, habitId text not null, date text not null, value real not null)`,
  );
  db.execute(`create table account (
    id text primary key, currency text not null, balance real not null default 0, labelText text not null default '',
    "order" real not null default 0, excludeFromDashboard integer not null default 0
  )`);
  db.execute(`create table transaction_entry (
    id text primary key, type text not null, accountId text not null, accountCurrency text not null,
    amount real not null, counterpartyAccountId text not null default '', counterpartyCurrency text not null default '',
    counterpartyAmount real, category text not null default '', effectiveAt integer not null
  )`);
  db.execute(`create table currency_rate (
    id text primary key, date text not null, baseCurrency text not null,
    ${APP_CURRENCIES.map((code) => `"${code}" real`).join(", ")}
  )`);
  db.execute(`create table dashboard_settings (
    id text primary key, rangeMode text not null default 'days', rangeDays integer not null default 30,
    cycleDay integer not null default 25, baseCurrency text not null default 'USD', timeZone text not null default ''
  )`);
  return db as unknown as WidgetDbReader & SQLiteDbWrapper<UserDb>;
}

type Db = Awaited<ReturnType<typeof createTestDb>>;

function insert(db: Db, table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  db.execute({
    sql: `insert into ${table} (${columns.map((column) => `"${column}"`).join(", ")}) values (${columns.map(() => "?").join(", ")})`,
    parameters: Object.values(row).map((value) => (typeof value === "boolean" ? Number(value) : value)),
  });
}

describe("notes widget", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("lists notes in manual order with plain-text previews", () => {
    insert(db, "item", {
      id: "n1",
      title: "Shopping",
      content: "- [ ] milk\n- [x] eggs\n\n**Bold** [link](x)",
      order: 2,
    });
    insert(db, "item", { id: "n2", title: "", content: "# Heading\nbody text", order: 1 });
    insert(db, "item", { id: "n3", title: "  Plan  ", content: "", order: 3 });
    insert(db, "item", { id: "dated", title: "Dated note", dueAt: NOW, order: 0 });
    insert(db, "item", { id: "task", type: "task", title: "A task", order: 0 });

    const snapshot = buildNotesWidgetSnapshot(readNotesWidgetInputs(db), ctx);
    expect(snapshot).toEqual({
      v: 1,
      kind: "notes",
      state: "ok",
      writtenAt: NOW,
      links: { open: "productivity:///", notes: "productivity:///notes", newNote: "productivity:///note/new" },
      notes: [
        { id: "n2", title: "Heading body text", preview: "", url: "productivity:///note/n2" },
        { id: "n1", title: "Shopping", preview: "☐ milk ☑ eggs Bold link", url: "productivity:///note/n1" },
        { id: "n3", title: "Plan", preview: "", url: "productivity:///note/n3" },
      ],
      total: 3,
    });
  });

  it("keeps the first notes and counts the rest", () => {
    for (let index = 0; index < NOTES_WIDGET_LIMIT + 5; index += 1) {
      insert(db, "item", { id: `n${index}`, title: `Note ${index}`, order: index });
    }
    const snapshot = buildNotesWidgetSnapshot(readNotesWidgetInputs(db), ctx);
    expect(snapshot.notes).toHaveLength(NOTES_WIDGET_LIMIT);
    expect(snapshot.notes[0]?.title).toBe("Note 0");
    expect(snapshot.total).toBe(NOTES_WIDGET_LIMIT + 5);
  });

  it("is empty without notes", () => {
    const snapshot = buildNotesWidgetSnapshot(readNotesWidgetInputs(db), ctx);
    expect(snapshot.state).toBe("empty");
    expect(snapshot.notes).toEqual([]);
  });
});

describe("today widget", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    const task = (id: string, fields: Record<string, unknown>) =>
      insert(db, "item", { id, type: "task", title: id, ...fields });
    task("overdue", { dueAt: at("2026-11-05", 10), hasDueTime: true });
    task("overdue-done", { dueAt: at("2026-11-04", 10), completedAt: NOW });
    task("late", { dueAt: at("2026-11-09", 23, 30), hasDueTime: true });
    task("morning", { dueAt: at("2026-11-09", 9, 30), hasDueTime: true });
    task("all-day-b", { dueAt: zonedMidnightMs("2026-11-09", TZ), order: 2 });
    task("all-day-a", { dueAt: zonedMidnightMs("2026-11-09", TZ), order: 1 });
    task("done", { dueAt: at("2026-11-09", 8), hasDueTime: true, completedAt: NOW });
    task("standup", { dueAt: at("2026-11-09", 12), hasDueTime: true, providerType: GOOGLE_CALENDAR_PROVIDER_TYPE });
    task("tomorrow", { dueAt: at("2026-11-10", 10), hasDueTime: true });
    task("later", { dueAt: at("2026-11-12", 10), hasDueTime: true });
    task("inbox", {});
    insert(db, "item", {
      id: "untitled",
      type: "task",
      title: " ",
      content: "**Call** the bank",
      dueAt: at("2026-11-09", 18),
      hasDueTime: true,
    });
  });

  it("matches Today section order, with inbox first and a done count", () => {
    const snapshot = buildTodayWidgetSnapshot(readTodayWidgetInputs(db, ctx), ctx);
    expect(snapshot.links).toEqual({
      open: "productivity:///",
      today: "productivity:///today",
      newTask: "productivity:///task/new",
    });
    const [today] = snapshot.days;
    expect(today?.dateKey).toBe("2026-11-09");
    expect(today?.title).toBe("Monday, November 9");
    expect(today?.startsAt).toBe(zonedMidnightMs("2026-11-09", TZ));
    expect(today?.overdue).toEqual({ count: 0, rows: [] });
    expect(today?.rows.map((row) => [row.title, row.time, row.event])).toEqual([
      ["inbox", null, false],
      ["overdue", null, false],
      ["morning", "09:30", false],
      ["standup", "12:00", true],
      ["all-day-a", null, false],
      ["all-day-b", null, false],
      ["Call the bank", "18:00", false],
      ["late", "23:30", false],
    ]);
    expect(today?.rows[1]).toMatchObject({ due: "Nov 5", url: "productivity:///task/overdue" });
    expect(today).toMatchObject({ remaining: 8, done: 1, total: 9 });
  });

  it("carries tomorrow, where today's unfinished tasks are overdue", () => {
    const snapshot = buildTodayWidgetSnapshot(readTodayWidgetInputs(db, ctx), ctx);
    const tomorrow = snapshot.days[1];
    expect(tomorrow?.dateKey).toBe("2026-11-10");
    expect(tomorrow?.title).toBe("Tuesday, November 10");
    expect(tomorrow?.startsAt).toBe(zonedMidnightMs("2026-11-10", TZ));
    expect(tomorrow?.rows.map((row) => row.id)).toEqual([
      "inbox",
      "overdue",
      "morning",
      "standup",
      "untitled",
      "late",
      "all-day-a",
      "all-day-b",
      "tomorrow",
    ]);
    expect(tomorrow?.rows.filter((row) => row.due)).toHaveLength(7);
    expect(tomorrow).toMatchObject({ remaining: 9, done: 0, total: 9 });
  });

  it("picks the day that has started", () => {
    const { days } = buildTodayWidgetSnapshot(readTodayWidgetInputs(db, ctx), ctx);
    const midnight = zonedMidnightMs("2026-11-10", TZ);
    expect(pickTodayWidgetDay(days, midnight - 1)?.dateKey).toBe("2026-11-09");
    expect(pickTodayWidgetDay(days, midnight)?.dateKey).toBe("2026-11-10");
    expect(pickTodayWidgetDay(days, NOW - 86_400_000)?.dateKey).toBe("2026-11-09");
    expect(pickTodayWidgetDay([], NOW)).toBeUndefined();
  });

  it("runs out when its last day ends, and has a stale form for after that", () => {
    const snapshot = buildTodayWidgetSnapshot(readTodayWidgetInputs(db, ctx), ctx);
    expect(snapshot.days.map((day) => day.endsAt)).toEqual([
      zonedMidnightMs("2026-11-10", TZ),
      zonedMidnightMs("2026-11-11", TZ),
    ]);
    expect(todayWidgetExpiresAt(snapshot.days)).toBe(zonedMidnightMs("2026-11-11", TZ));
    expect(todayWidgetExpiresAt([])).toBeUndefined();
    expect(todayWidgetExpiresAt(undefined)).toBeUndefined();

    const stale = staleTodayWidgetSnapshot(snapshot);
    expect(stale).toMatchObject({ state: "stale", days: [], links: snapshot.links });
    expect(widgetSnapshotHash(stale)).not.toBe(widgetSnapshotHash(snapshot));
  });

  it("ends a day at the next local midnight across a DST change", () => {
    // Clocks go back on November 1, 2026 in New York: that day is 25 hours long.
    const dst = { ...ctx, now: at("2026-10-31", 15) };
    const { days } = buildTodayWidgetSnapshot(readTodayWidgetInputs(db, dst), dst);
    const last = days[days.length - 1];
    expect(last?.dateKey).toBe("2026-11-01");
    expect((last?.endsAt ?? 0) - (last?.startsAt ?? 0)).toBe(25 * 3_600_000);
    expect(todayWidgetExpiresAt(days)).toBe(zonedMidnightMs("2026-11-02", TZ));
  });

  it("gives a snapshot written before days had an end 24 hours for its last day", () => {
    const { days } = buildTodayWidgetSnapshot(readTodayWidgetInputs(db, ctx), ctx);
    const old = days.map(({ endsAt: _endsAt, ...day }) => day) as typeof days;
    expect(todayWidgetExpiresAt(old)).toBe(zonedMidnightMs("2026-11-10", TZ) + 86_400_000);
  });

  it("caps the listed rows but counts them all", async () => {
    const busy = await createTestDb();
    for (let index = 0; index < 15; index += 1) {
      insert(busy, "item", {
        id: `t${index}`,
        type: "task",
        title: `t${index}`,
        dueAt: zonedMidnightMs("2026-11-09", TZ),
      });
    }
    const [today] = buildTodayWidgetSnapshot(readTodayWidgetInputs(busy, ctx), ctx).days;
    expect(today?.rows).toHaveLength(10);
    expect(today?.remaining).toBe(15);
  });
});

describe("finances widget", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    insert(db, "dashboard_settings", { id: "dashboard", baseCurrency: "EUR" });
    insert(db, "currency_rate", { id: "r1", date: "2026-11-08", baseCurrency: "USD", EUR: 0.9, UAH: 41.5 });
    insert(db, "account", { id: "usd", currency: "USD", balance: 1000, order: 1 });
    insert(db, "account", { id: "eur", currency: "EUR", balance: 500, order: 2 });
    insert(db, "account", { id: "hidden", currency: "USD", balance: 5000, order: 3, excludeFromDashboard: true });
    const entry = (id: string, fields: Record<string, unknown>) => insert(db, "transaction_entry", { id, ...fields });
    entry("salary", {
      type: "income",
      accountId: "eur",
      accountCurrency: "EUR",
      amount: 300,
      effectiveAt: at("2026-11-02", 9),
    });
    entry("food-usd", {
      type: "expense",
      accountId: "usd",
      accountCurrency: "USD",
      amount: -100,
      category: "Food",
      effectiveAt: at("2026-11-03", 12),
    });
    entry("food-eur", {
      type: "expense",
      accountId: "eur",
      accountCurrency: "EUR",
      amount: -50,
      category: "Food",
      effectiveAt: at("2026-11-05", 12),
    });
    entry("bus", {
      type: "expense",
      accountId: "eur",
      accountCurrency: "EUR",
      amount: -20,
      category: "Transport",
      effectiveAt: at("2026-11-06", 8),
    });
    entry("misc", {
      type: "expense",
      accountId: "eur",
      accountCurrency: "EUR",
      amount: -5,
      effectiveAt: at("2026-11-07", 8),
    });
    entry("hidden-rent", {
      type: "expense",
      accountId: "hidden",
      accountCurrency: "USD",
      amount: -999,
      category: "Rent",
      effectiveAt: at("2026-11-04", 8),
    });
    // October 31st, 23:00 in New York: already November in UTC, but last month for the user.
    entry("halloween", {
      type: "expense",
      accountId: "usd",
      accountCurrency: "USD",
      amount: -10,
      category: "Party",
      effectiveAt: at("2026-10-31", 23),
    });
  });

  it("sums net worth, selected range flows and top categories in the display currency", () => {
    const snapshot = buildFinancesWidgetSnapshot(readFinancesWidgetInputs(db, ctx), ctx);
    expect(snapshot).toEqual({
      v: 1,
      kind: "finances",
      state: "ok",
      writtenAt: NOW,
      links: { open: "productivity:///", finances: "productivity:///finances" },
      currency: "EUR",
      netWorth: "€1,400.00",
      netWorthCompact: "€1.4K",
      change: null,
      net: { amount: "+€126.00", compact: "+€126", direction: "up" },
      monthLabel: "Last 30 days",
      periodLabel: "Last 30 days",
      income: "€300.00",
      expense: "€174.00",
      categories: [
        { name: "Food", amount: "€140.00", share: 140 / 174 },
        { name: "Transport", amount: "€20.00", share: 20 / 174 },
        { name: "Party", amount: "€9.00", share: 9 / 174 },
      ],
      notice: null,
    });
  });

  it("uses the saved cycle boundary for all flow metrics, and follows a range setting edit", () => {
    db.execute(`update dashboard_settings set rangeMode = 'cycle', cycleDay = 5`);
    const cycle = buildFinancesWidgetSnapshot(readFinancesWidgetInputs(db, ctx), ctx);
    expect(cycle).toMatchObject({
      netWorth: "€1,400.00",
      periodLabel: "Since the 5th",
      income: "€0.00",
      expense: "€75.00",
      net: { amount: "-€75.00", direction: "down" },
    });
    expect(cycle.categories.map((category) => category.name)).toEqual(["Food", "Transport", "Uncategorized"]);
    db.execute(`update dashboard_settings set rangeMode = 'days', rangeDays = 1`);
    const day = buildFinancesWidgetSnapshot(readFinancesWidgetInputs(db, ctx), ctx);
    expect(day).toMatchObject({
      netWorth: "€1,400.00",
      periodLabel: "Last 1 days",
      income: "€0.00",
      expense: "€0.00",
      categories: [],
    });
    expect(day.net?.direction).toBe("flat");
  });

  it("leaves out money it can't convert and says so", () => {
    insert(db, "account", { id: "gbp", currency: "GBP", balance: 100, order: 4 });
    insert(db, "transaction_entry", {
      id: "pub",
      type: "expense",
      accountId: "gbp",
      accountCurrency: "GBP",
      amount: -30,
      category: "Pub",
      effectiveAt: at("2026-11-08", 20),
    });
    const snapshot = buildFinancesWidgetSnapshot(readFinancesWidgetInputs(db, ctx), ctx);
    expect(snapshot.netWorth).toBe("€1,400.00");
    expect(snapshot.change).toBeNull();
    expect(snapshot.expense).toBe("€174.00");
    expect(snapshot.categories.map((category) => category.name)).not.toContain("Pub");
    expect(snapshot.notice).toBe("1 account not converted · some transactions not converted");
  });

  it("counts only the display currency when no rates are stored", () => {
    db.execute("delete from currency_rate");
    const snapshot = buildFinancesWidgetSnapshot(readFinancesWidgetInputs(db, ctx), ctx);
    expect(snapshot.netWorth).toBe("€500.00");
    expect(snapshot.notice).toBe("1 account not converted · some transactions not converted");
  });

  it("is empty without accounts or transactions", async () => {
    const empty = await createTestDb();
    const snapshot = buildFinancesWidgetSnapshot(readFinancesWidgetInputs(empty, ctx), ctx);
    expect(snapshot).toMatchObject({ state: "empty", currency: "USD", netWorth: "$0.00", categories: [] });
  });
});

describe("snapshots", () => {
  it("builds every kind and reports the queries it read", async () => {
    const db = await createTestDb();
    const { snapshots, queries } = buildWidgetSnapshots(db, ctx);
    expect(Object.keys(snapshots)).toEqual(["notes", "today", "finances"]);
    expect(queries.length).toBeGreaterThanOrEqual(8);
    expect(queries.every((query) => typeof query.sql === "string" && Array.isArray(query.parameters))).toBe(true);
    // Re-running a recorded query gives the same rows the builder saw.
    for (const query of queries) expect(() => db.execute(query)).not.toThrow();
  });

  it("hashes content, not the time it was written", async () => {
    const db = await createTestDb();
    const first = buildNotesWidgetSnapshot(readNotesWidgetInputs(db), ctx);
    const later = buildNotesWidgetSnapshot(readNotesWidgetInputs(db), { ...ctx, now: NOW + 60_000 });
    expect(widgetSnapshotHash(later)).toBe(widgetSnapshotHash(first));
    insert(db, "item", { id: "n1", title: "New" });
    expect(widgetSnapshotHash(buildNotesWidgetSnapshot(readNotesWidgetInputs(db), ctx))).not.toBe(
      widgetSnapshotHash(first),
    );
  });

  it("has a signed-out snapshot per kind whose links open the app", () => {
    for (const kind of ["notes", "today", "finances"] as const) {
      const snapshot = signedOutWidgetSnapshot(kind, ctx);
      expect(snapshot).toMatchObject({ v: 1, kind, state: "signedOut", writtenAt: NOW });
      expect(new Set(Object.values(snapshot.links))).toEqual(new Set(["productivity:///"]));
    }
  });
});
