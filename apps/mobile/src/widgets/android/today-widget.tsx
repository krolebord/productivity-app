"use no memo";

import {
  pickTodayWidgetDay,
  type TodayWidgetRow,
  type TodayWidgetSnapshot,
  todayWidgetExpiresAt,
} from "@productivity/core/widgets/snapshots";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetPalette } from "../theme";
import { CalendarIcon, Header, type LayoutProps, List, Message, MoreRow, openUri, Shell, Square } from "./components";

const SECTION_HEIGHT = 22;

/**
 * Today, simplified: unfinished inbox and agenda items in page order in a scrolling list, and
 * how many are done. The list holds the whole snapshot; "+N more" opens Today for what it left out.
 * The snapshot carries today and tomorrow; this picks by the clock at draw time, and the widget's
 * periodic update (app.json) redraws it from the file after midnight. Once tomorrow has ended too
 * the snapshot is stale: rather than show a past day as today, it asks to open the app.
 */
export function TodayWidget({
  colors,
  snapshot,
  now,
}: LayoutProps & { snapshot: Partial<TodayWidgetSnapshot>; now: number }) {
  const links = snapshot.links;
  if (snapshot.state === "signedOut") {
    return (
      <Shell colors={colors} uri={links?.open}>
        <Header title="Today" uri={links?.open} colors={colors} />
        <Message title="Sign in" detail="to see your day" uri={links?.open} colors={colors} />
      </Shell>
    );
  }

  const expiresAt = todayWidgetExpiresAt(snapshot.days);
  const stale = expiresAt != null && now >= expiresAt;
  const day = stale ? undefined : pickTodayWidgetDay(snapshot.days, now);
  const overdue = day?.overdue ?? { count: 0, rows: [] };
  const rows = day?.rows ?? [];
  const remaining = Math.max(day?.remaining ?? 0, rows.length);

  // Rows the snapshot left out (it caps each list); everything in it is in the scrolling list.
  const notListed = remaining - rows.length + (overdue.count - overdue.rows.length);
  const nothingLeft = overdue.count === 0 && remaining === 0;

  return (
    <Shell colors={colors} uri={links?.today}>
      <Header
        title="Today"
        subtitle={day?.title}
        uri={links?.today}
        plusUri={links?.newTask}
        plusLabel="New task"
        colors={colors}
      />
      {stale ? (
        // Opening the app republishes (the foreground refresh in session.ts).
        <Message title="Open the app" detail="to refresh your day" uri={links?.today} colors={colors} />
      ) : nothingLeft ? (
        <Message
          title={day && day.total > 0 ? "All done" : "Nothing planned"}
          detail={day && day.total > 0 ? undefined : "Tap + to add a task"}
          uri={links?.today}
          colors={colors}
        />
      ) : (
        <List marginBottom={8}>
          {overdue.count > 0 ? (
            <FlexWidget
              key="overdue"
              style={{ height: SECTION_HEIGHT, width: "match_parent", justifyContent: "center" }}
            >
              <TextWidget
                text={`Overdue · ${overdue.count}`}
                maxLines={1}
                style={{ fontSize: 12, fontWeight: "700", color: colors.destructive }}
              />
            </FlexWidget>
          ) : null}
          {overdue.rows.map((row) => (
            <Row key={row.id} row={row} colors={colors} />
          ))}
          {rows.map((row) => (
            <Row key={row.id} row={row} colors={colors} />
          ))}
          {notListed > 0 && links ? (
            <MoreRow key="more" text={`+${notListed} more`} uri={links.today} colors={colors} />
          ) : null}
        </List>
      )}
      <FlexWidget style={{ paddingVertical: 4, width: "match_parent", flexDirection: "row", alignItems: "center" }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={day && day.total > 0 ? `${day.done} of ${day.total} done` : ""}
            maxLines={1}
            style={{ fontSize: 12, color: colors.mutedForeground }}
          />
        </FlexWidget>
        {links ? (
          <FlexWidget {...openUri(links.today)} style={{ justifyContent: "center" }}>
            <TextWidget
              text="Open Today"
              maxLines={1}
              style={{ fontSize: 13, fontWeight: "500", color: colors.primary }}
            />
          </FlexWidget>
        ) : null}
      </FlexWidget>
    </Shell>
  );
}

function Row({ row, colors }: { row: TodayWidgetRow; colors: WidgetPalette }) {
  const trailing = row.due ?? row.time;
  return (
    <FlexWidget
      {...openUri(row.url)}
      style={{ paddingVertical: 4, width: "match_parent", flexDirection: "row", alignItems: "center" }}
    >
      {row.event ? (
        <CalendarIcon colors={colors} />
      ) : row.kind === "habit" ? (
        <TextWidget text="↻" style={{ fontSize: 16, color: colors.mutedForeground, marginRight: 8 }} />
      ) : (
        <Square colors={colors} />
      )}
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget text={row.title} maxLines={2} style={{ fontSize: 14, color: colors.foreground }} />
      </FlexWidget>
      {trailing ? (
        <TextWidget
          text={trailing}
          maxLines={1}
          style={{ fontSize: 12, color: row.due ? colors.destructive : colors.mutedForeground, marginLeft: 6 }}
        />
      ) : null}
    </FlexWidget>
  );
}
