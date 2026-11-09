"use no memo";
// iOS widgets (expo-widgets + @expo/ui). Each layout is a 'widget' function: Babel serializes it to
// a string that runs in the widget extension's own JS runtime, so it can't use hooks, imports or
// module-scope values at runtime; only its arguments, plain JS, and the @expo/ui components and
// modifiers (globals there). That's why each layout repeats its palette (from theme.ts) and helpers.
// `createWidget` stores the layout in App Group defaults on every launch, which is how layout
// changes ship over the air. Only this file imports expo-widgets/@expo/ui (Biome rule).
//
// Gotchas (docs/widgets.md): `props` is undefined until the app publishes (start with
// `input ?? {}`); every root needs containerBackground(…, "widget") and a full-width leading frame
// (content renders centered otherwise); systemSmall only supports widgetURL, not Link; the
// extension's `Image` global is React Native's, not SwiftUI's, so icons use Label.

import { HStack, Label, Link, Mask, Rectangle, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  clipped,
  containerBackground,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  labelStyle,
  layoutPriority,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import {
  type FinancesWidgetSnapshot,
  type NotesWidgetSnapshot,
  staleTodayWidgetSnapshot,
  type TodayWidgetSnapshot,
  todayWidgetExpiresAt,
  type WidgetSnapshotOf,
} from "@productivity/core/widgets/snapshots";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import { WIDGET_NAMES, type WidgetPublisher } from "./kinds";

const NotesLayout = (input: Partial<NotesWidgetSnapshot> | undefined, env: WidgetEnvironment) => {
  "widget";
  const props = input ?? {};
  const c =
    env.colorScheme === "dark"
      ? { background: "#171717", foreground: "#e5e5e5", muted: "#a3a3a3", primary: "#a78bfa" }
      : { background: "#ffffff", foreground: "#333333", muted: "#6b7280", primary: "#8b5cf6" };
  const small = env.widgetFamily === "systemSmall";
  const links = props.links;
  const notes = props.notes ?? [];
  const total = Math.max(props.total ?? 0, notes.length);
  const root = (url: string | undefined, children: React.ReactNode) => (
    <VStack
      alignment="leading"
      spacing={small ? 6 : 10}
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
        containerBackground(c.background, "widget"),
        ...(url ? [widgetURL(url)] : []),
      ]}
    >
      {children}
    </VStack>
  );
  const header = (
    <HStack modifiers={[layoutPriority(1)]}>
      <Text modifiers={[font({ size: small ? 15 : 17, weight: "bold" }), foregroundStyle(c.foreground)]}>Notes</Text>
      <Spacer />
      {!small && links?.newNote && props.state !== "signedOut" ? (
        <Link destination={links.newNote}>
          <Label
            title="New note"
            systemImage="plus.circle.fill"
            modifiers={[labelStyle("iconOnly"), font({ size: 24 }), foregroundStyle(c.primary)]}
          />
        </Link>
      ) : null}
    </HStack>
  );
  const message = (title: string, detail: string) => (
    <VStack alignment="leading" spacing={2}>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: "semibold" }), foregroundStyle(c.foreground)]}>{title}</Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(c.muted)]}>{detail}</Text>
      <Spacer />
    </VStack>
  );

  if (props.state === "signedOut") return root(links?.open, [header, message("Sign in", "to see your notes")]);
  if (notes.length === 0) {
    // A small widget is one tap target: when empty, make it the one that starts a note.
    return root(small ? (links?.newNote ?? links?.notes) : links?.notes, [
      header,
      message("No notes yet", small ? "Tap to write one" : "Tap + to write one"),
    ]);
  }

  if (small) {
    // systemSmall can't link per row: titles only, and the whole widget opens Notes.
    const shown = notes.slice(0, total > 4 ? 3 : 4);
    return root(links?.notes, [
      header,
      ...shown.map((note) => (
        <Text key={note.id} modifiers={[font({ size: 13 }), lineLimit(1), foregroundStyle(c.foreground)]}>
          {note.title}
        </Text>
      )),
      <Spacer key="spacer" />,
      total > shown.length ? (
        <Text key="more" modifiers={[font({ size: 12, weight: "medium" }), foregroundStyle(c.primary)]}>
          {`${total - shown.length} more`}
        </Text>
      ) : null,
    ]);
  }

  // systemLarge: every note in the snapshot, clipped at the bottom with a fade; iOS doesn't tell a
  // layout its height, so the footer links to the full list instead of counting what's hidden.
  return root(links?.notes, [
    header,
    // minHeight 0: a frame with only a max never gets smaller than its content, and the list would
    // push the header and footer out of the widget.
    <Mask
      key="list"
      alignment="top"
      modifiers={[frame({ maxWidth: Infinity, minHeight: 0, maxHeight: Infinity, alignment: "top" }), clipped()]}
    >
      <VStack
        alignment="leading"
        spacing={10}
        modifiers={[frame({ maxWidth: Infinity, minHeight: 0, maxHeight: Infinity, alignment: "topLeading" })]}
      >
        {notes.map((note) => {
          const row = (
            <VStack
              key={note.id}
              alignment="leading"
              spacing={2}
              modifiers={[frame({ maxWidth: Infinity, alignment: "leading" }), fixedSize({ vertical: true })]}
            >
              <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1), foregroundStyle(c.foreground)]}>
                {note.title}
              </Text>
              {note.preview ? (
                <Text modifiers={[font({ size: 13 }), lineLimit(2), foregroundStyle(c.muted)]}>{note.preview}</Text>
              ) : null}
            </VStack>
          );
          // Placeholder rows have no URL, and an empty Link destination isn't a valid URL.
          return note.url ? (
            <Link key={note.id} destination={note.url}>
              {row}
            </Link>
          ) : (
            <VStack key={note.id}>{row}</VStack>
          );
        })}
      </VStack>
      {/* Fade the rows themselves out over the last 24 pt: iOS tints the widget background, so a
          gradient painted in the palette's background color shows as a band in dark mode. */}
      <Mask.Content>
        <VStack spacing={0}>
          <Rectangle modifiers={[foregroundStyle("#000000")]} />
          <Rectangle
            modifiers={[
              frame({ maxWidth: Infinity, minHeight: 24, maxHeight: 24 }),
              foregroundStyle({
                type: "linearGradient",
                colors: ["#000000", "#00000000"],
                startPoint: { x: 0.5, y: 0 },
                endPoint: { x: 0.5, y: 1 },
              }),
            ]}
          />
        </VStack>
      </Mask.Content>
    </Mask>,
    <HStack key="footer" modifiers={[layoutPriority(1)]}>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(c.muted)]}>
        {total === 1 ? "1 note" : `${total} notes`}
      </Text>
      <Spacer />
      {links?.notes ? (
        <Link destination={links.notes}>
          <Text modifiers={[font({ size: 13, weight: "medium" }), foregroundStyle(c.primary)]}>View all</Text>
        </Link>
      ) : null}
    </HStack>,
  ]);
};

const TodayLayout = (input: Partial<TodayWidgetSnapshot> | undefined, env: WidgetEnvironment) => {
  "widget";
  const props = input ?? {};
  const c =
    env.colorScheme === "dark"
      ? { background: "#171717", foreground: "#e5e5e5", muted: "#a3a3a3", primary: "#a78bfa", destructive: "#ef4444" }
      : { background: "#ffffff", foreground: "#333333", muted: "#6b7280", primary: "#8b5cf6", destructive: "#ef4444" };
  const links = props.links;
  // Each timeline entry carries its own day; picking by the entry's date also copes with a snapshot
  // that carries several (same rule as core's pickTodayWidgetDay).
  const at = env.date ? new Date(env.date).getTime() : Date.now();
  const days = props.days ?? [];
  let day = days[0];
  for (const candidate of days) if (candidate.startsAt <= at) day = candidate;

  const header = (
    <HStack modifiers={[layoutPriority(1)]}>
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[font({ size: 17, weight: "bold" }), foregroundStyle(c.foreground)]}>Today</Text>
        {day?.title ? <Text modifiers={[font({ size: 13 }), foregroundStyle(c.muted)]}>{day.title}</Text> : null}
      </VStack>
      <Spacer />
      {links?.newTask && props.state !== "signedOut" ? (
        <Link destination={links.newTask}>
          <Label
            title="New task"
            systemImage="plus.circle.fill"
            modifiers={[labelStyle("iconOnly"), font({ size: 26 }), foregroundStyle(c.primary)]}
          />
        </Link>
      ) : null}
    </HStack>
  );
  const root = (url: string | undefined, children: React.ReactNode) => (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
        containerBackground(c.background, "widget"),
        ...(url ? [widgetURL(url)] : []),
      ]}
    >
      {children}
    </VStack>
  );
  const message = (title: string, detail: string | null) => (
    <VStack alignment="leading" spacing={2}>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: "semibold" }), foregroundStyle(c.foreground)]}>{title}</Text>
      {detail ? <Text modifiers={[font({ size: 12 }), foregroundStyle(c.muted)]}>{detail}</Text> : null}
      <Spacer />
    </VStack>
  );

  if (props.state === "signedOut") return root(links?.open, [header, message("Sign in", "to see your day")]);

  const overdue = day?.overdue ?? { count: 0, rows: [] };
  const rows = day?.rows ?? [];
  const remaining = Math.max(day?.remaining ?? 0, rows.length);
  const done = day?.done ?? 0;
  const total = day?.total ?? 0;

  type Row = (typeof rows)[number];
  const row = (item: Row) => {
    const trailing = item.due ?? item.time;
    const content = (
      <HStack spacing={8} modifiers={[fixedSize({ vertical: true })]}>
        <Label
          title="Task"
          systemImage="square"
          modifiers={[labelStyle("iconOnly"), font({ size: 15 }), foregroundStyle(c.muted)]}
        />
        <Text modifiers={[font({ size: 15 }), lineLimit(1), foregroundStyle(c.foreground)]}>{item.title}</Text>
        <Spacer />
        {item.event ? (
          <Label
            title="Event"
            systemImage="calendar"
            modifiers={[labelStyle("iconOnly"), font({ size: 12 }), foregroundStyle(c.muted)]}
          />
        ) : null}
        {trailing ? (
          <Text
            modifiers={[font({ size: 13 }), monospacedDigit(), foregroundStyle(item.due ? c.destructive : c.muted)]}
          >
            {trailing}
          </Text>
        ) : null}
      </HStack>
    );
    return item.url ? (
      <Link key={item.id} destination={item.url}>
        {content}
      </Link>
    ) : (
      <VStack key={item.id}>{content}</VStack>
    );
  };

  const footer = (
    <HStack key="footer" modifiers={[layoutPriority(1)]}>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(c.muted)]}>
        {total > 0 ? `${done} of ${total} done` : ""}
      </Text>
      <Spacer />
      {links?.today ? (
        <Link destination={links.today}>
          <Text modifiers={[font({ size: 13, weight: "medium" }), foregroundStyle(c.primary)]}>Open Today</Text>
        </Link>
      ) : null}
    </HStack>
  );

  // The timeline's last entry: the days the app published have ended, and it hasn't run since.
  // Opening it republishes.
  if (props.state === "stale") {
    return root(links?.today, [header, message("Open the app", "to refresh your day"), footer]);
  }
  if (overdue.count === 0 && remaining === 0) {
    return root(links?.today, [
      header,
      total > 0 ? message("All done", null) : message("Nothing planned", "Tap + to add a task"),
      footer,
    ]);
  }
  // Every row in the snapshot (overdue first), clipped at the bottom with a fade: iOS doesn't tell
  // a layout its height, so the footer opens Today instead of counting what's hidden.
  return root(links?.today, [
    header,
    // minHeight 0: a frame with only a max never gets smaller than its content, and the list would
    // push the header and footer out of the widget.
    <Mask
      key="list"
      alignment="top"
      modifiers={[frame({ maxWidth: Infinity, minHeight: 0, maxHeight: Infinity, alignment: "top" }), clipped()]}
    >
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[frame({ maxWidth: Infinity, minHeight: 0, maxHeight: Infinity, alignment: "topLeading" })]}
      >
        {overdue.count > 0 ? (
          <Text
            key="overdue"
            modifiers={[
              font({ size: 12, weight: "bold" }),
              foregroundStyle(c.destructive),
              fixedSize({ vertical: true }),
            ]}
          >
            {`Overdue · ${overdue.count}`}
          </Text>
        ) : null}
        {overdue.rows.map(row)}
        {rows.map(row)}
      </VStack>
      {/* Fade the rows themselves out over the last 24 pt: iOS tints the widget background, so a
          gradient painted in the palette's background color shows as a band in dark mode. */}
      <Mask.Content>
        <VStack spacing={0}>
          <Rectangle modifiers={[foregroundStyle("#000000")]} />
          <Rectangle
            modifiers={[
              frame({ maxWidth: Infinity, minHeight: 24, maxHeight: 24 }),
              foregroundStyle({
                type: "linearGradient",
                colors: ["#000000", "#00000000"],
                startPoint: { x: 0.5, y: 0 },
                endPoint: { x: 0.5, y: 1 },
              }),
            ]}
          />
        </VStack>
      </Mask.Content>
    </Mask>,
    footer,
  ]);
};

const FinancesLayout = (input: Partial<FinancesWidgetSnapshot> | undefined, env: WidgetEnvironment) => {
  "widget";
  const props = input ?? {};
  const c =
    env.colorScheme === "dark"
      ? { background: "#171717", foreground: "#e5e5e5", muted: "#a3a3a3", income: "#34d399", expense: "#fb7185" }
      : { background: "#ffffff", foreground: "#333333", muted: "#6b7280", income: "#059669", expense: "#e11d48" };
  const medium = env.widgetFamily === "systemMedium";
  const links = props.links;
  const label = (text: string) => <Text modifiers={[font({ size: 12 }), foregroundStyle(c.muted)]}>{text}</Text>;
  const root = (url: string | undefined, children: React.ReactNode) => (
    // Any tap opens Finances: the whole widget is one link, small and medium alike.
    <VStack
      alignment="leading"
      spacing={2}
      modifiers={[
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
        containerBackground(c.background, "widget"),
        ...(url ? [widgetURL(url)] : []),
      ]}
    >
      {children}
    </VStack>
  );
  const message = (title: string, detail: string) => [
    label("Finances"),
    <Spacer key="top" />,
    <Text key="title" modifiers={[font({ size: 15, weight: "semibold" }), foregroundStyle(c.foreground)]}>
      {title}
    </Text>,
    <Text key="detail" modifiers={[font({ size: 12 }), foregroundStyle(c.muted)]}>
      {detail}
    </Text>,
    <Spacer key="bottom" />,
  ];

  if (props.state === "signedOut") return root(links?.open, message("Sign in", "to see your finances"));
  if (props.state === "empty") return root(links?.finances, message("No accounts yet", "Add one in Finances"));

  const change = props.change;
  const arrow = change?.direction === "up" ? "↑" : change?.direction === "down" ? "↓" : "→";
  const changeColor = change?.direction === "up" ? c.income : change?.direction === "down" ? c.expense : c.muted;
  const summary = (
    <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: Infinity, alignment: "topLeading" })]}>
      {label("Net worth")}
      <Text
        modifiers={[
          font({ size: 24, weight: "bold" }),
          lineLimit(1),
          minimumScaleFactor(0.5),
          foregroundStyle(c.foreground),
        ]}
      >
        {props.netWorth ?? ""}
      </Text>
      {change ? (
        <Text modifiers={[font({ size: 13, weight: "semibold" }), lineLimit(1), foregroundStyle(changeColor)]}>
          {`${arrow} ${medium ? change.amount : change.compact}`}
        </Text>
      ) : null}
      {change ? label("this month") : null}
      <Spacer />
      {props.notice ? (
        <Text modifiers={[font({ size: 10 }), lineLimit(2), foregroundStyle(c.muted)]}>{props.notice}</Text>
      ) : null}
    </VStack>
  );
  if (!medium) return root(links?.finances, summary);

  const amount = (name: string, value: string | undefined, color: string, small: boolean) => (
    <HStack key={name}>
      <Text
        modifiers={[font({ size: small ? 12 : 13 }), lineLimit(1), foregroundStyle(small ? c.muted : c.foreground)]}
      >
        {name}
      </Text>
      <Spacer />
      <Text
        modifiers={[font({ size: small ? 12 : 13, weight: small ? "regular" : "semibold" }), foregroundStyle(color)]}
      >
        {value ?? ""}
      </Text>
    </HStack>
  );
  return root(links?.finances, [
    <HStack key="columns" alignment="top" spacing={16}>
      {summary}
      <VStack alignment="leading" spacing={3} modifiers={[frame({ maxWidth: Infinity, alignment: "topLeading" })]}>
        {label(props.monthLabel ?? "This month")}
        {amount("Income", props.income, c.income, false)}
        {amount("Spent", props.expense, c.expense, false)}
        <Spacer />
        {(props.categories ?? []).map((category) => amount(category.name, category.amount, c.foreground, true))}
      </VStack>
    </HStack>,
  ]);
};

// Placeholders: the gallery preview and what a widget shows before the app first publishes. The
// build captures these into the embedded layout registry, so they must be plain literals; with no
// links, taps just open the app. No nulls: they're stored in UserDefaults (see withoutNulls).
const NOTES_PLACEHOLDER = {
  v: 1,
  kind: "notes",
  state: "ok",
  writtenAt: 0,
  notes: [
    { id: "p1", title: "Weekly plan", preview: "☐ Groceries ☐ Call the bank ☑ Book flights", url: "" },
    { id: "p2", title: "Meeting notes", preview: "Decisions, owners and next steps", url: "" },
    { id: "p3", title: "Gift ideas", preview: "Books, a plant, concert tickets", url: "" },
  ],
  total: 3,
} as unknown as NotesWidgetSnapshot;

const TODAY_PLACEHOLDER = {
  v: 1,
  kind: "today",
  state: "ok",
  writtenAt: 0,
  days: [
    {
      dateKey: "",
      startsAt: 0,
      title: "Your day at a glance",
      overdue: { count: 0, rows: [] },
      rows: [
        { id: "p1", title: "Review the budget", time: "09:30", event: false, url: "" },
        { id: "p2", title: "Team sync", time: "11:00", event: true, url: "" },
        { id: "p3", title: "Call the bank", event: false, url: "" },
      ],
      remaining: 3,
      done: 1,
      total: 4,
    },
  ],
} as unknown as TodayWidgetSnapshot;

const FINANCES_PLACEHOLDER = {
  v: 1,
  kind: "finances",
  state: "ok",
  writtenAt: 0,
  currency: "USD",
  netWorth: "$12,480.00",
  netWorthCompact: "$12.5K",
  change: { amount: "+$320.00", compact: "+$320", direction: "up" },
  monthLabel: "This month",
  income: "$4,200.00",
  expense: "$2,150.00",
  categories: [
    { name: "Groceries", amount: "$640.00", share: 0.3 },
    { name: "Rent", amount: "$1,200.00", share: 0.56 },
    { name: "Transport", amount: "$120.00", share: 0.06 },
  ],
} as unknown as FinancesWidgetSnapshot;

const notesWidget = createWidget<NotesWidgetSnapshot>(WIDGET_NAMES.notes, NotesLayout, NOTES_PLACEHOLDER);
const todayWidget = createWidget<TodayWidgetSnapshot>(WIDGET_NAMES.today, TodayLayout, TODAY_PLACEHOLDER);
const financesWidget = createWidget<FinancesWidgetSnapshot>(
  WIDGET_NAMES.finances,
  FinancesLayout,
  FINANCES_PLACEHOLDER,
);

/**
 * expo-widgets stores props in App Group UserDefaults, which can't hold null (the native call
 * throws "Exception in HostFunction"). Layouts read a missing field like a null one.
 */
function withoutNulls<T>(props: T): T {
  return JSON.parse(JSON.stringify(props, (_key, value) => (value === null ? undefined : value))) as T;
}

/**
 * Today goes out as a timeline, one entry per day starting at its local midnight, so the widget
 * turns over at midnight without the app. Each entry carries only its own day. A last entry at
 * the end of the last day is the stale form: without it the widget would keep showing that day
 * as today until the app next runs.
 */
export const iosWidgetPublisher: WidgetPublisher | null = {
  async publish(kind, published) {
    const snapshot = withoutNulls(published);
    if (kind === "today") {
      const today = snapshot as WidgetSnapshotOf<"today">;
      const expiresAt = todayWidgetExpiresAt(today.days);
      if (expiresAt != null) {
        todayWidget.updateTimeline([
          ...today.days.map((day) => ({ date: new Date(day.startsAt), props: { ...today, days: [day] } })),
          { date: new Date(expiresAt), props: staleTodayWidgetSnapshot(today) },
        ]);
      } else {
        todayWidget.updateSnapshot(today);
      }
    } else if (kind === "notes") {
      notesWidget.updateSnapshot(snapshot as WidgetSnapshotOf<"notes">);
    } else {
      financesWidget.updateSnapshot(snapshot as WidgetSnapshotOf<"finances">);
    }
  },
};
