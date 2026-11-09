"use no memo";
// React Compiler breaks react-native-android-widget's renderer ("Invalid Hook Call"): these are
// plain functions turned into RemoteViews, not React components that render on screen.

import type { ReactNode } from "react";
import { FlexWidget, ListWidget, SvgWidget, TextWidget, type WidgetInfo } from "react-native-android-widget";
import type { WidgetPalette } from "../theme";

export const PADDING = 14;
const HEADER_HEIGHT = 36;
/** Below this width (dp) layouts drop to their narrow form: about three launcher cells. */
export const WIDE_MIN_WIDTH = 250;

export type LayoutProps = { info: WidgetInfo; colors: WidgetPalette };

export function openUri(uri: string | undefined) {
  return uri
    ? ({ clickAction: "OPEN_URI", clickActionData: { uri } } as const)
    : ({ clickAction: "OPEN_APP" } as const);
}

export function Shell({
  colors,
  uri,
  children,
}: {
  colors: WidgetPalette;
  /** Where a tap on empty space goes; the app when unset. */
  uri?: string;
  children: ReactNode;
}) {
  return (
    <FlexWidget
      {...openUri(uri)}
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: colors.background,
        borderRadius: 24,
        padding: PADDING,
      }}
    >
      {children}
    </FlexWidget>
  );
}

export function Header({
  title,
  subtitle,
  uri,
  plusUri,
  plusLabel,
  colors,
}: {
  title: string;
  subtitle?: string;
  uri?: string;
  plusUri?: string;
  plusLabel?: string;
  colors: WidgetPalette;
}) {
  return (
    <FlexWidget style={{ height: HEADER_HEIGHT, width: "match_parent", flexDirection: "row", alignItems: "center" }}>
      <FlexWidget {...openUri(uri)} style={{ flex: 1, height: "match_parent", justifyContent: "center" }}>
        <TextWidget text={title} maxLines={1} style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }} />
        {subtitle ? (
          <TextWidget text={subtitle} maxLines={1} style={{ fontSize: 12, color: colors.mutedForeground }} />
        ) : null}
      </FlexWidget>
      {plusUri ? <PlusButton uri={plusUri} label={plusLabel ?? "New"} colors={colors} /> : null}
    </FlexWidget>
  );
}

const svg = (color: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// Feather icons, the set the app uses.
const PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
const CALENDAR =
  '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>';

function PlusButton({ uri, label, colors }: { uri: string; label: string; colors: WidgetPalette }) {
  return (
    <FlexWidget
      {...openUri(uri)}
      accessibilityLabel={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SvgWidget svg={svg(colors.primaryForeground, PLUS)} style={{ width: 18, height: 18 }} />
    </FlexWidget>
  );
}

export function CalendarIcon({ colors }: { colors: WidgetPalette }) {
  return <SvgWidget svg={svg(colors.mutedForeground, CALENDAR)} style={{ width: 12, height: 12, marginRight: 6 }} />;
}

/** The task checkbox: square, as in the app (docs/design-principles.md). Display only in v1. */
export function Square({ colors }: { colors: WidgetPalette }) {
  return (
    <FlexWidget
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: colors.mutedForeground,
        marginRight: 10,
      }}
    />
  );
}

/** A centered message filling the body: signed out, empty, never published. */
export function Message({
  title,
  detail,
  uri,
  colors,
}: {
  title: string;
  detail?: string;
  uri?: string;
  colors: WidgetPalette;
}) {
  return (
    <FlexWidget
      {...openUri(uri)}
      style={{ flex: 1, width: "match_parent", alignItems: "center", justifyContent: "center" }}
    >
      <TextWidget
        text={title}
        maxLines={2}
        style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, textAlign: "center" }}
      />
      {detail ? (
        <TextWidget
          text={detail}
          maxLines={2}
          style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginTop: 2 }}
        />
      ) : null}
    </FlexWidget>
  );
}

/**
 * The scrolling body of a list widget: it takes the height left between the header and anything
 * below, and every child is one list item. Lists show the whole snapshot; whatever the snapshot
 * left out is a trailing `MoreRow`.
 */
export function List({ children }: { children: ReactNode }) {
  return (
    <FlexWidget style={{ flex: 1, width: "match_parent" }}>
      <ListWidget style={{ height: "match_parent", width: "match_parent" }}>{children}</ListWidget>
    </FlexWidget>
  );
}

/** The trailing "N more" / "Open …" link row. */
export function MoreRow({ text, uri, colors }: { text: string; uri: string; colors: WidgetPalette }) {
  return (
    <FlexWidget {...openUri(uri)} style={{ width: "match_parent", height: MORE_ROW_HEIGHT, justifyContent: "center" }}>
      <TextWidget text={text} maxLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.primary }} />
    </FlexWidget>
  );
}

export const MORE_ROW_HEIGHT = 26;
