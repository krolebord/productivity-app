"use no memo";

import type { FinancesWidgetSnapshot } from "@productivity/core/widgets/snapshots";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetPalette } from "../theme";
import { type LayoutProps, Message, openUri, Shell, WIDE_MIN_WIDTH } from "./components";

const ARROWS = { up: "↑", down: "↓", flat: "→" } as const;

/** Net worth and this month's change; wide also lists the month's income, spending and top categories. */
export function FinancesWidget({
  info,
  colors,
  snapshot,
}: LayoutProps & { snapshot: Partial<FinancesWidgetSnapshot> }) {
  const links = snapshot.links;
  // Any tap opens Finances.
  const uri = links?.finances;
  if (snapshot.state === "signedOut") {
    return (
      <Shell colors={colors} uri={links?.open}>
        <Label text="Finances" colors={colors} />
        <Message title="Sign in" detail="to see your finances" uri={links?.open} colors={colors} />
      </Shell>
    );
  }
  if (snapshot.state === "empty") {
    return (
      <Shell colors={colors} uri={uri}>
        <Label text="Finances" colors={colors} />
        <Message title="No accounts yet" detail="Add one in Finances" uri={uri} colors={colors} />
      </Shell>
    );
  }

  const wide = info.width >= WIDE_MIN_WIDTH;
  const change = snapshot.change;
  const changeColor =
    change?.direction === "up" ? colors.income : change?.direction === "down" ? colors.expense : colors.mutedForeground;
  const summary = (
    <FlexWidget style={{ flex: 1, height: "match_parent" }}>
      <Label text="Net worth" colors={colors} />
      <TextWidget
        text={(wide ? snapshot.netWorth : snapshot.netWorthCompact) ?? ""}
        maxLines={1}
        style={{ fontSize: 26, fontWeight: "700", color: colors.foreground, adjustsFontSizeToFit: true }}
      />
      {change ? (
        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
          <TextWidget
            text={`${ARROWS[change.direction]} ${wide ? change.amount : change.compact}`}
            maxLines={1}
            style={{ fontSize: 13, fontWeight: "600", color: changeColor }}
          />
          <TextWidget text=" this month" maxLines={1} style={{ fontSize: 12, color: colors.mutedForeground }} />
        </FlexWidget>
      ) : null}
      <FlexWidget style={{ flex: 1 }} />
      {snapshot.notice ? (
        <TextWidget text={snapshot.notice} maxLines={2} style={{ fontSize: 10, color: colors.mutedForeground }} />
      ) : null}
    </FlexWidget>
  );

  return (
    <Shell colors={colors} uri={uri}>
      <FlexWidget {...openUri(uri)} style={{ flex: 1, width: "match_parent", flexDirection: "row" }}>
        {summary}
        {wide ? (
          <FlexWidget style={{ flex: 1, height: "match_parent", marginLeft: 14 }}>
            <Label text={snapshot.monthLabel ?? "This month"} colors={colors} />
            <Amount label="Income" value={snapshot.income} color={colors.income} colors={colors} />
            <Amount label="Spent" value={snapshot.expense} color={colors.expense} colors={colors} />
            <FlexWidget style={{ height: 6 }} />
            {(snapshot.categories ?? []).map((category) => (
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
