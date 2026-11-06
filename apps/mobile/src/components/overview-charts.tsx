import { formatBalance, formatCompactNumber } from "@productivity/core/currency/format";
import { useNetWorthSeries } from "@productivity/core/data/finance";
import { FLOW_COLOR, IMPORTANCE_CHART_COLOR, IMPORTANCE_LABELS } from "@productivity/core/finance/appearance";
import type { CashFlowPoint, DailySpendingPoint, TrendBucket } from "@productivity/core/finance/overview";
import { IMPORTANCE_TIERS } from "@productivity/core/transactions";
import { type ReactNode, useEffect, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { type SharedValue, useAnimatedReaction } from "react-native-reanimated";
import { Circle, matchFont, Rect } from "react-native-skia";
import { scheduleOnRN } from "react-native-worklets";
import { useCSSVariable } from "uniwind";
import {
  Area,
  Bar,
  CartesianChart,
  type ChartBounds,
  Line,
  type PointsArray,
  StackedBar,
  useChartPressState,
} from "victory-native";

export type OverviewChart = "flow" | "networth" | "spending";

export const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 11,
});

/** Scrubbing starts after a short hold so a swipe over the chart still scrolls the screen. */
export const PRESS_CONFIG = { pan: { activateAfterLongPress: 120 } };

export const DOMAIN_PADDING = { left: 20, right: 20, top: 12 };
export const ROUNDED = { topLeft: 4, topRight: 4, bottomLeft: 4, bottomRight: 4 };
export const ROUNDED_TOP = { topLeft: 4, topRight: 4 };
export const ROUNDED_BOTTOM = { bottomLeft: 4, bottomRight: 4 };

const CHART_VARS = [
  "--color-muted-foreground",
  "--color-border",
  "--color-chart-1",
  "--color-chart-2",
  "--color-chart-3",
  "--color-chart-4",
  "--color-chart-5",
];

export function useChartTheme() {
  const [label, grid, ...palette] = useCSSVariable(CHART_VARS) as (string | undefined)[];
  return {
    label: label ?? "#888888",
    grid: grid ?? "#e5e7eb",
    palette: palette.map((color) => color ?? "#8b5cf6"),
  };
}

/**
 * Mirrors the chart's press state into React so the details panel can render the touched point.
 * The last touched point stays selected after the finger lifts (a phone has no hover to fall
 * back on) until the buckets change, e.g. a new range. The series are rebuilt on every render,
 * so the buckets are compared by label rather than identity.
 */
export function useSelectedIndex(
  state: { isActive: SharedValue<boolean>; matchedIndex: SharedValue<number> },
  data: readonly { label: string }[],
) {
  const [index, setIndex] = useState<number | null>(null);
  const bucketKey = data.map((point) => point.label).join("|");
  const [selectedKey, setSelectedKey] = useState(bucketKey);
  if (selectedKey !== bucketKey) {
    setSelectedKey(bucketKey);
    setIndex(null);
  }
  useAnimatedReaction(
    () => (state.isActive.get() ? state.matchedIndex.get() : -1),
    (current, previous) => {
      if (current !== previous && current >= 0) scheduleOnRN(setIndex, current);
    },
  );
  return index !== null && index < data.length ? index : null;
}

/** Victory spreads these over its defaults, so every key must hold a real value. */
export function axes(theme: ReturnType<typeof useChartTheme>, xTickCount: number) {
  return {
    xAxis: { font: axisFont, labelColor: theme.label, lineWidth: 0, tickCount: xTickCount },
    yAxis: [
      {
        font: axisFont,
        labelColor: theme.label,
        lineColor: theme.grid,
        tickCount: 4,
        formatYLabel: (value: unknown) => formatCompactNumber(Number(value)),
      },
    ],
    frame: { lineWidth: 0 },
  };
}

export function slotWidth(points: PointsArray, chartBounds: ChartBounds) {
  return points.length > 1 ? points[1].x - points[0].x : chartBounds.right - chartBounds.left;
}

function shiftPoints(points: PointsArray, dx: number): PointsArray {
  return points.map((point) => ({ ...point, x: point.x + dx }));
}

/** A soft column behind the touched bucket, standing in for the web's hover cursor. */
export function ColumnHighlight({
  points,
  index,
  chartBounds,
  color,
}: {
  points: PointsArray;
  index: number | null;
  chartBounds: ChartBounds;
  color: string;
}) {
  const point = index === null ? undefined : points[index];
  if (!point) return null;
  const width = slotWidth(points, chartBounds);
  return (
    <Rect
      x={point.x - width / 2}
      y={chartBounds.top}
      width={width}
      height={chartBounds.bottom - chartBounds.top}
      color={color}
      opacity={0.5}
    />
  );
}

function ChartEmptyState({ children }: { children: string }) {
  return (
    <View className="h-56 items-center justify-center">
      <Text className="text-muted-foreground text-sm">{children}</Text>
    </View>
  );
}

export function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-1.5 border-border border-t pt-3">
      <Text className="font-medium text-foreground text-sm">{title}</Text>
      {children}
    </View>
  );
}

export function DetailRow({
  color,
  label,
  hint,
  value,
}: {
  color?: string;
  label: string;
  hint?: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      {color && <View className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />}
      <Text className="text-muted-foreground text-sm">
        {label}
        {hint && <Text className="text-muted-foreground/70"> {hint}</Text>}
      </Text>
      <Text className="ml-auto font-medium text-foreground text-sm tabular-nums">{value}</Text>
    </View>
  );
}

/** The series key under a chart, as the web's chart legend. */
export function Legend({ items }: { items: readonly { color: string; label: string }[] }) {
  return (
    <View className="flex-row flex-wrap justify-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View className="size-2.5 rounded-[2px]" style={{ backgroundColor: item.color }} />
          <Text className="text-muted-foreground text-xs">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function CashFlowChart({ data, baseCurrency }: { data: CashFlowPoint[]; baseCurrency: string }) {
  const theme = useChartTheme();
  const { state } = useChartPressState({
    x: "",
    y: { income: 0, expense: 0, fixed: 0, flexible: 0, optional: 0, investment: 0 },
  });
  const pressed = useSelectedIndex(state, data);
  const row = data[pressed ?? data.length - 1];

  return (
    <View className="gap-3">
      <View className="h-56">
        <CartesianChart
          data={data}
          xKey="label"
          yKeys={["income", "expense", ...IMPORTANCE_TIERS]}
          domain={{ y: [0] }}
          domainPadding={DOMAIN_PADDING}
          chartPressState={state}
          chartPressConfig={PRESS_CONFIG}
          {...axes(theme, data.length)}
        >
          {({ points, chartBounds }) => {
            const barWidth = Math.min(16, slotWidth(points.income, chartBounds) * 0.32);
            const offset = barWidth / 2 + 1;
            return (
              <>
                <ColumnHighlight points={points.income} index={pressed} chartBounds={chartBounds} color={theme.grid} />
                <Bar
                  points={shiftPoints(points.income, -offset)}
                  chartBounds={chartBounds}
                  barWidth={barWidth}
                  color={FLOW_COLOR.income}
                  roundedCorners={ROUNDED}
                />
                <StackedBar
                  points={IMPORTANCE_TIERS.map((tier) => shiftPoints(points[tier], offset))}
                  chartBounds={chartBounds}
                  barWidth={barWidth}
                  colors={IMPORTANCE_TIERS.map((tier) => IMPORTANCE_CHART_COLOR[tier])}
                  barOptions={({ isTop, isBottom }) => ({
                    roundedCorners: { ...(isTop ? ROUNDED_TOP : {}), ...(isBottom ? ROUNDED_BOTTOM : {}) },
                  })}
                />
              </>
            );
          }}
        </CartesianChart>
      </View>
      <Legend
        items={[
          { color: FLOW_COLOR.income, label: "Income" },
          ...IMPORTANCE_TIERS.map((tier) => ({ color: IMPORTANCE_CHART_COLOR[tier], label: IMPORTANCE_LABELS[tier] })),
        ]}
      />
      {row && (
        <Details title={row.label}>
          <DetailRow color={FLOW_COLOR.income} label="Income" value={formatBalance(row.income, baseCurrency)} />
          <DetailRow color={FLOW_COLOR.expense} label="Expenses" value={formatBalance(row.expense, baseCurrency)} />
          <DetailRow color={FLOW_COLOR.net} label="Net" value={formatBalance(row.net, baseCurrency)} />
          <View className="mt-1 gap-1.5 border-border border-t pt-1.5">
            {[...IMPORTANCE_TIERS].reverse().map((tier) => (
              <DetailRow
                key={tier}
                color={IMPORTANCE_CHART_COLOR[tier]}
                label={IMPORTANCE_LABELS[tier]}
                hint={`(${(row.expense > 0 ? (row[tier] / row.expense) * 100 : 0).toFixed(0)}%)`}
                value={formatBalance(row[tier], baseCurrency)}
              />
            ))}
          </View>
        </Details>
      )}
    </View>
  );
}

function NetWorthChart({ buckets, baseCurrency }: { buckets: TrendBucket[]; baseCurrency: string }) {
  const theme = useChartTheme();
  const { data, refresh } = useNetWorthSeries({ buckets, baseCurrency });
  const { state } = useChartPressState({ x: "", y: { netWorth: 0 } });
  const pressed = useSelectedIndex(state, data);
  const point = data[pressed ?? data.length - 1];
  // Like recharts' default [0, auto]: anchor at zero unless net worth dips below it.
  const minNetWorth = Math.min(0, ...data.map((item) => item.netWorth ?? 0));

  // The newest point is cut off at query time, so re-run it as time passes, as the web does.
  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, 60_000);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh]);

  return (
    <View className="gap-3">
      <View className="h-56">
        <CartesianChart
          data={data}
          xKey="label"
          yKeys={["netWorth"]}
          domain={{ y: [minNetWorth] }}
          domainPadding={DOMAIN_PADDING}
          chartPressState={state}
          chartPressConfig={PRESS_CONFIG}
          {...axes(theme, data.length)}
        >
          {({ points, yScale }) => {
            const active = pressed === null ? undefined : points.netWorth[pressed];
            return (
              <>
                <Area
                  points={points.netWorth}
                  y0={yScale(0)}
                  curveType="monotoneX"
                  color={FLOW_COLOR.netWorth}
                  opacity={0.2}
                />
                <Line points={points.netWorth} curveType="monotoneX" color={FLOW_COLOR.netWorth} strokeWidth={2} />
                {active && active.y != null && <Circle cx={active.x} cy={active.y} r={4} color={FLOW_COLOR.netWorth} />}
              </>
            );
          }}
        </CartesianChart>
      </View>
      {point && (
        <Details title={point.label}>
          <DetailRow
            color={FLOW_COLOR.netWorth}
            label="Net worth"
            value={point.netWorth === null ? "Rate unavailable" : formatBalance(point.netWorth, baseCurrency)}
          />
          {point.estimatedCurrencies > 0 && (
            <Text className="text-muted-foreground text-xs">Uses exchange rates from a nearby date.</Text>
          )}
        </Details>
      )}
      {data.some((item) => item.missingCurrencies > 0) && (
        <Text className="text-muted-foreground text-xs">
          Some points are unavailable because exchange rates are missing.
        </Text>
      )}
    </View>
  );
}

function SpendingChart({ data, baseCurrency }: { data: DailySpendingPoint[]; baseCurrency: string }) {
  const theme = useChartTheme();
  const { state } = useChartPressState({ x: "", y: { total: 0 } });
  const pressed = useSelectedIndex(state, data);
  // Until a day is touched, show the latest day that had spending rather than an empty today.
  const latestSpendingIndex = data.findLastIndex((point) => point.total > 0);
  const row = data[pressed ?? (latestSpendingIndex >= 0 ? latestSpendingIndex : data.length - 1)];

  return (
    <View className="gap-3">
      <View className="h-56">
        <CartesianChart
          data={data}
          xKey="label"
          yKeys={["total"]}
          domain={{ y: [0] }}
          domainPadding={DOMAIN_PADDING}
          chartPressState={state}
          chartPressConfig={PRESS_CONFIG}
          {...axes(theme, Math.min(data.length, 6))}
        >
          {({ points, chartBounds }) => (
            <>
              <ColumnHighlight points={points.total} index={pressed} chartBounds={chartBounds} color={theme.grid} />
              <Bar
                points={points.total}
                chartBounds={chartBounds}
                barWidth={Math.min(16, slotWidth(points.total, chartBounds) * 0.6)}
                color={FLOW_COLOR.expense}
                roundedCorners={ROUNDED}
              />
            </>
          )}
        </CartesianChart>
      </View>
      {row && (
        <Details title={row.dateLabel}>
          {row.categories.length > 0 ? (
            row.categories.map((item, index) => (
              <DetailRow
                key={item.name}
                color={theme.palette[index % theme.palette.length]}
                label={item.name}
                value={formatBalance(item.value, baseCurrency)}
              />
            ))
          ) : (
            <Text className="text-muted-foreground text-sm">No spending</Text>
          )}
          <View className="mt-1 border-border border-t pt-1.5">
            <DetailRow label="Total" value={formatBalance(row.total, baseCurrency)} />
          </View>
        </Details>
      )}
    </View>
  );
}

/** The three finance overview charts. Hold and drag across a chart to inspect a period. */
export function OverviewCharts({
  activeChart,
  baseCurrency,
  dailySpending,
  flowData,
  hasAccounts,
  trendBuckets,
}: {
  activeChart: OverviewChart;
  baseCurrency: string;
  dailySpending: DailySpendingPoint[];
  flowData: CashFlowPoint[];
  hasAccounts: boolean;
  trendBuckets: TrendBucket[];
}) {
  if (activeChart === "flow") {
    if (!flowData.some((point) => point.income !== 0 || point.expense !== 0)) {
      return <ChartEmptyState>No income or expenses in this period.</ChartEmptyState>;
    }
    return <CashFlowChart data={flowData} baseCurrency={baseCurrency} />;
  }

  if (activeChart === "networth") {
    if (!hasAccounts) {
      return <ChartEmptyState>Add an account to track net worth.</ChartEmptyState>;
    }
    return <NetWorthChart buckets={trendBuckets} baseCurrency={baseCurrency} />;
  }

  if (dailySpending.every((point) => point.total === 0)) {
    return <ChartEmptyState>No spending recorded in this period.</ChartEmptyState>;
  }
  return <SpendingChart data={dailySpending} baseCurrency={baseCurrency} />;
}
