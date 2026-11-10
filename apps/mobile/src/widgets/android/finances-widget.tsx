"use no memo";

import type { FinancesWidgetSnapshot } from "@productivity/core/widgets/snapshots";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetPalette } from "../theme";
import { type LayoutProps, Message, openUri, Shell, WIDE_MIN_WIDTH } from "./components";

/** Net worth and period net; wide adds flows, and taller widgets also show top categories. */
export function FinancesWidget({
  info,
  colors,
  snapshot,
}: LayoutProps & { snapshot: Partial<FinancesWidgetSnapshot> }) {
  const links = snapshot.links;
  // Any tap opens Finances.
  const uri = links?.finances;
  // One launcher row is roughly 95 dp on Pixel. Use three short lines and less padding there;
  // categories need the second row. Use actual dp rather than guessing a launcher's cell count.
  const compact = info.height < 160;
  const padding = compact ? 8 : undefined;
  if (snapshot.state === "signedOut" || snapshot.state === "empty") {
    const signedOut = snapshot.state === "signedOut";
    const messageUri = signedOut ? links?.open : uri;
    return (
      <Shell colors={colors} uri={messageUri} padding={padding}>
        <Label text="Finances" colors={colors} />
        <Message
          title={signedOut ? "Sign in" : "No accounts yet"}
          detail={compact ? undefined : signedOut ? "to see your finances" : "Add one in Finances"}
          uri={messageUri}
          colors={colors}
        />
      </Shell>
    );
  }

  const wide = info.width >= WIDE_MIN_WIDTH;
  const change = snapshot.net;
  const changeColor =
    change?.direction === "up" ? colors.income : change?.direction === "down" ? colors.expense : colors.mutedForeground;
  const summary = (
    <FlexWidget style={{ flex: 1, height: "match_parent", justifyContent: compact ? "center" : "flex-start" }}>
      <Label text="Net worth" colors={colors} />
      <TextWidget
        text={(wide ? snapshot.netWorth : snapshot.netWorthCompact) ?? ""}
        maxLines={1}
        style={{ fontSize: compact ? 20 : 26, fontWeight: "700", color: colors.foreground, adjustsFontSizeToFit: true }}
      />
      {change && !(compact && snapshot.notice) ? (
        <FlexWidget style={{ width: "match_parent" }}>
          <TextWidget
            text={`Net ${wide ? change.amount : change.compact}${compact && !wide ? ` · ${snapshot.periodLabel ?? ""}` : ""}`}
            maxLines={1}
            style={{ fontSize: compact ? 11 : 13, fontWeight: "600", color: changeColor, adjustsFontSizeToFit: true }}
          />
          {!compact && !wide ? (
            <TextWidget
              text={snapshot.periodLabel ?? ""}
              maxLines={1}
              style={{ fontSize: 12, color: colors.mutedForeground }}
            />
          ) : null}
        </FlexWidget>
      ) : null}
      {!compact ? <FlexWidget style={{ flex: 1 }} /> : null}
      {snapshot.notice ? (
        <TextWidget
          text={snapshot.notice}
          maxLines={compact ? 1 : 2}
          style={{ fontSize: 10, color: colors.mutedForeground }}
        />
      ) : null}
    </FlexWidget>
  );

  return (
    <Shell colors={colors} uri={uri} padding={padding}>
      <FlexWidget {...openUri(uri)} style={{ flex: 1, width: "match_parent", flexDirection: "row" }}>
        {summary}
        {wide ? (
          <FlexWidget
            style={{
              flex: 1,
              height: "match_parent",
              marginLeft: 14,
              justifyContent: compact ? "center" : "flex-start",
            }}
          >
            <Label text={snapshot.periodLabel ?? ""} colors={colors} />
            <Amount label="Income" value={snapshot.income} color={colors.income} colors={colors} />
            <Amount label="Spent" value={snapshot.expense} color={colors.expense} colors={colors} />
            {!compact ? <FlexWidget style={{ height: 6 }} /> : null}
            {(compact ? [] : (snapshot.categories ?? [])).map((category) => (
              <Amount
                key={category.name}
                label={category.name}
                value={category.amount}
                color={colors.foreground}
                colors={colors}
                small
              />
            ))}
          </FlexWidget>
        ) : null}
      </FlexWidget>
    </Shell>
  );
}

function Label({ text, colors }: { text: string; colors: WidgetPalette }) {
  return <TextWidget text={text} maxLines={1} style={{ fontSize: 12, color: colors.mutedForeground }} />;
}

function Amount({
  label,
  value,
  color,
  colors,
  small = false,
}: {
  label: string;
  value: string | undefined;
  color: `#${string}`;
  colors: WidgetPalette;
  small?: boolean;
}) {
  return (
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", height: small ? 18 : 22 }}>
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget
          text={label}
          maxLines={1}
          style={{ fontSize: small ? 12 : 13, color: small ? colors.mutedForeground : colors.foreground }}
        />
      </FlexWidget>
      <TextWidget
        text={value ?? ""}
        maxLines={1}
        style={{ fontSize: small ? 12 : 13, fontWeight: small ? "normal" : "600", color }}
      />
    </FlexWidget>
  );
}
