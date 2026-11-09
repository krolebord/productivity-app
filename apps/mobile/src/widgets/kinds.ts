import type { WidgetKind, WidgetSnapshotOf } from "@productivity/core/widgets/snapshots";

/**
 * Native widget names: the `name` of each widget under both widget plugins in app.json (the
 * Android provider class and the iOS widget kind). Renaming one is a native change: it needs a new
 * build, and widgets already placed under the old name stop updating.
 */
export const WIDGET_NAMES = {
  notes: "NotesWidget",
  today: "TodayWidget",
  finances: "FinancesWidget",
} as const satisfies Record<WidgetKind, string>;

export function widgetKindForName(name: string): WidgetKind | undefined {
  return (Object.keys(WIDGET_NAMES) as WidgetKind[]).find((kind) => WIDGET_NAMES[kind] === name);
}

/** Draws on one platform's widgets; the app layer decides what and when (see refresh.ts). */
export type WidgetPublisher = {
  publish<Kind extends WidgetKind>(kind: Kind, snapshot: WidgetSnapshotOf<Kind>): Promise<void>;
};
