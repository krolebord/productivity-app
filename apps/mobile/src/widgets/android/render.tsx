"use no memo";

import type { WidgetKind, WidgetSnapshotOf } from "@productivity/core/widgets/snapshots";
import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";
import { DARK_PALETTE, LIGHT_PALETTE, type WidgetPalette } from "../theme";
import { Header, Message, Shell } from "./components";
import { FinancesWidget } from "./finances-widget";
import { NotesWidget } from "./notes-widget";
import { TodayWidget } from "./today-widget";

const TITLES: Record<WidgetKind, string> = { notes: "Notes", today: "Today", finances: "Finances" };

function render(
  kind: WidgetKind,
  snapshot: WidgetSnapshotOf<WidgetKind> | null,
  info: WidgetInfo,
  now: number,
  colors: WidgetPalette,
) {
  // Never published (fresh install, or the app hasn't run since): the app has to build one first.
  if (!snapshot) {
    return (
      <Shell colors={colors}>
        <Header title={TITLES[kind]} colors={colors} />
        <Message title="Open the app" detail="to set up this widget" colors={colors} />
      </Shell>
    );
  }
  // Fields may be missing when this layout (shipped over the air) meets an older snapshot.
  switch (kind) {
    case "notes":
      return <NotesWidget info={info} colors={colors} snapshot={snapshot as WidgetSnapshotOf<"notes">} />;
    case "today":
      return <TodayWidget info={info} colors={colors} snapshot={snapshot as WidgetSnapshotOf<"today">} now={now} />;
    case "finances":
      return <FinancesWidget info={info} colors={colors} snapshot={snapshot as WidgetSnapshotOf<"finances">} />;
  }
}

/** Both themes: the launcher shows the one matching the system's dark mode. */
export function renderAndroidWidget(
  kind: WidgetKind,
  snapshot: WidgetSnapshotOf<WidgetKind> | null,
  info: WidgetInfo,
  now: number,
): WidgetRepresentation {
  return {
    light: render(kind, snapshot, info, now, LIGHT_PALETTE),
    dark: render(kind, snapshot, info, now, DARK_PALETTE),
  };
}
