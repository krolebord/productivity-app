/**
 * Home-screen widget snapshots: small, display-ready data the app builds and publishes, so
 * widgets only draw and never read the user DB. One snapshot per widget kind, trimmed to what
 * that kind draws (iOS stores each in App Group defaults; the extension has a tight memory cap).
 *
 * Layouts ship over the air and can meet a snapshot written by an older (or newer) build, so the
 * shape is versioned and layouts must tolerate missing fields. Add fields freely; bump `v` only
 * for changes old layouts would misread. See docs/widgets.md.
 */

export const WIDGET_SNAPSHOT_VERSION = 1 as const;

export const WIDGET_KINDS = ["notes", "today", "finances"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

type SnapshotBase<Kind extends WidgetKind, State extends string> = {
  v: typeof WIDGET_SNAPSHOT_VERSION;
  kind: Kind;
  state: State;
  /** When the app built it (epoch ms). */
  writtenAt: number;
};

// Notes

export type NotesWidgetNote = {
  id: string;
  /** The note's title, or the start of its text when it has none. */
  title: string;
  /** Plain text after the title (markdown stripped, checklists as "☐ item"); empty when none. */
  preview: string;
  url: string;
};

export type NotesWidgetSnapshot = SnapshotBase<"notes", "ok" | "empty" | "signedOut"> & {
  links: { open: string; notes: string; newNote: string };
  /** The first notes in the Notes tab's manual order. */
  notes: NotesWidgetNote[];
  /** All notes, for "N more". */
  total: number;
};

// Today

export type TodayWidgetRow = {
  id: string;
  title: string;
  /** "09:30" for timed rows, null for all-day ones. */
  time: string | null;
  /** Mirrored from a calendar (an event rather than a task). */
  event: boolean;
  /** Due day for overdue rows ("Nov 5"). */
  due: string | null;
  url: string;
};

/** What Today shows on one calendar day. A snapshot carries today and tomorrow (see `pickTodayWidgetDay`). */
export type TodayWidgetDay = {
  dateKey: string;
  /** Local midnight that starts this day (epoch ms). */
  startsAt: number;
  /** Local midnight that ends it (epoch ms); 23 or 25 hours later on a DST change. */
  endsAt: number;
  /** "Monday, November 9". */
  title: string;
  /** Incomplete tasks due before this day: the count and the first few. */
  overdue: { count: number; rows: TodayWidgetRow[] };
  /** This day's incomplete tasks and events: timed ones by time, then all-day. Trimmed; see `remaining`. */
  rows: TodayWidgetRow[];
  /** All of this day's incomplete tasks and events (`rows` may hold fewer). */
  remaining: number;
  /** This day's tasks and events, done and total (completed rows aren't listed). */
  done: number;
  total: number;
};

/**
 * `stale` is never built from the DB: it's what a widget draws once the last day of an `ok`
 * snapshot has ended and the app hasn't published since (see `staleTodayWidgetSnapshot`).
 */
export type TodayWidgetSnapshot = SnapshotBase<"today", "ok" | "signedOut" | "stale"> & {
  links: { open: string; today: string; newTask: string };
  /** Today, then tomorrow, so the widget is right after midnight without the app. */
  days: TodayWidgetDay[];
};

// Finances

export type FinancesWidgetCategory = {
  name: string;
  amount: string;
  /** Share of the month's expenses, 0–1. */
  share: number;
};

export type FinancesWidgetSnapshot = SnapshotBase<"finances", "ok" | "empty" | "signedOut"> & {
  links: { open: string; finances: string };
  /** Display currency (`baseCurrency` from the dashboard settings). */
  currency: string;
  netWorth: string;
  /** For tight spots ("$12.3K"). */
  netWorthCompact: string;
  /** Net worth change since the start of the month; null when a rate is missing for either end. */
  change: { amount: string; compact: string; direction: "up" | "down" | "flat" } | null;
  /** "November". */
  monthLabel: string;
  income: string;
  expense: string;
  /** Top spending categories this month, biggest first. */
  categories: FinancesWidgetCategory[];
  /** Why some money isn't counted ("2 accounts not converted"), or null. */
  notice: string | null;
};

export type WidgetSnapshot = NotesWidgetSnapshot | TodayWidgetSnapshot | FinancesWidgetSnapshot;

export type WidgetSnapshotOf<Kind extends WidgetKind> = Extract<WidgetSnapshot, { kind: Kind }>;

export type WidgetSnapshots = { [Kind in WidgetKind]: WidgetSnapshotOf<Kind> };

/**
 * What the builders need besides data. The app passes the device's zone, which is what its own
 * Today and Finances screens use, and its URL scheme (`productivity` or `productivity-dev`).
 */
export type WidgetContext = {
  now: number;
  timeZone: string;
  /** Deep link for an app path: `note/abc` → `productivity:///note/abc`. */
  link: (path: string) => string;
};

export function createWidgetLinker(scheme: string): WidgetContext["link"] {
  return (path) => `${scheme}:///${path.replace(/^\/+/, "")}`;
}

/**
 * App paths widgets link to. `today`, `note/new` and `task/new` aren't routes: the app's native
 * intent handler rewrites them (a widget's links are fixed when drawn, so it can't mint an id per tap).
 */
export const WIDGET_PATHS = {
  open: "",
  today: "today",
  notes: "notes",
  finances: "finances",
  newNote: "note/new",
  newTask: "task/new",
  note: (id: string) => `note/${id}`,
  task: (id: string) => `task/${id}`,
} as const;

export function signedOutWidgetSnapshot<Kind extends WidgetKind>(
  kind: Kind,
  { now, link }: Pick<WidgetContext, "now" | "link">,
): WidgetSnapshotOf<Kind> {
  const base = { v: WIDGET_SNAPSHOT_VERSION, state: "signedOut" as const, writtenAt: now };
  const open = link(WIDGET_PATHS.open);
  // Every link opens the app: it shows sign-in until there's a session.
  const snapshots: WidgetSnapshots = {
    notes: { ...base, kind: "notes", links: { open, notes: open, newNote: open }, notes: [], total: 0 },
    today: { ...base, kind: "today", links: { open, today: open, newTask: open }, days: [] },
    finances: {
      ...base,
      kind: "finances",
      links: { open, finances: open },
      currency: "",
      netWorth: "",
      netWorthCompact: "",
      change: null,
      monthLabel: "",
      income: "",
      expense: "",
      categories: [],
      notice: null,
    },
  };
  return snapshots[kind] as WidgetSnapshotOf<Kind>;
}

/**
 * The day a Today snapshot should show at `now`: the latest one that has started. Falls back to
 * the first (a snapshot from the future, e.g. after a clock change).
 */
export function pickTodayWidgetDay(days: readonly TodayWidgetDay[] | undefined, now: number) {
  if (!days?.length) return undefined;
  let picked = days[0];
  for (const day of days) {
    if (day.startsAt <= now) picked = day;
  }
  return picked;
}

const DAY_MS = 86_400_000;

/**
 * When a Today snapshot runs out: the end of the last day it carries, or undefined without days.
 * From then on a widget would show a past day as today, so it draws the stale form instead.
 */
export function todayWidgetExpiresAt(days: readonly TodayWidgetDay[] | undefined): number | undefined {
  const last = days?.[days.length - 1];
  if (!last) return undefined;
  // Snapshots written before `endsAt` existed lack it.
  return last.endsAt ?? last.startsAt + DAY_MS;
}

/** A Today snapshot past its last day: no days, and layouts ask to open the app, which republishes. */
export function staleTodayWidgetSnapshot(snapshot: TodayWidgetSnapshot): TodayWidgetSnapshot {
  return { ...snapshot, state: "stale", days: [] };
}

/**
 * A fingerprint of what a snapshot draws (everything but `writtenAt`), so the app only publishes
 * kinds whose content changed. iOS reloads count against WidgetKit's budget when the app is in
 * the background.
 */
export function widgetSnapshotHash(snapshot: WidgetSnapshot): string {
  const text = JSON.stringify({ ...snapshot, writtenAt: 0 });
  // FNV-1a, 32 bit: collisions only cost a skipped redraw, and the length makes them rarer still.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16)}:${text.length}`;
}
