import { useEffect, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Rectangle,
  type RectangleProps,
  XAxis,
  YAxis,
} from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { formatBalance, formatCompactNumber } from "@/lib/currency/format";
import { type NetWorthPoint, netWorthQuery } from "@/lib/finance/net-worth";
import type { CashFlowPoint, DailySpendingPoint, TrendBucket } from "@/lib/finance/overview";
import { CATEGORY_DONUT_PALETTE, FLOW_COLOR, IMPORTANCE_STYLE } from "@/lib/finance-ui";
import { IMPORTANCE_TIERS, type ImportanceTier } from "@/lib/transactions";

import { useDbQuery } from "@/user-db/user-db";

export type OverviewChart = "flow" | "networth" | "spending";

const flowConfig = {
  income: { label: "Income", color: FLOW_COLOR.income },
  expense: { label: "Expenses", color: FLOW_COLOR.expense },
  net: { label: "Net", color: FLOW_COLOR.net },
  fixed: { label: IMPORTANCE_STYLE.fixed.label, color: IMPORTANCE_STYLE.fixed.chartColor },
  flexible: { label: IMPORTANCE_STYLE.flexible.label, color: IMPORTANCE_STYLE.flexible.chartColor },
  optional: { label: IMPORTANCE_STYLE.optional.label, color: IMPORTANCE_STYLE.optional.chartColor },
  investment: { label: IMPORTANCE_STYLE.investment.label, color: IMPORTANCE_STYLE.investment.chartColor },
} satisfies ChartConfig;

const spendingConfig = {
  total: { label: "Spending", color: FLOW_COLOR.expense },
} satisfies ChartConfig;

function ChartEmptyState({ children }: { children: string }) {
  return <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">{children}</div>;
}

function getTopExpenseTier(row: Partial<Record<ImportanceTier, number>>) {
  return [...IMPORTANCE_TIERS].reverse().find((tier) => (row[tier] ?? 0) > 0);
}

function getBottomExpenseTier(row: Partial<Record<ImportanceTier, number>>) {
  return IMPORTANCE_TIERS.find((tier) => (row[tier] ?? 0) > 0);
}

type CashFlowBarShapeProps = RectangleProps & {
  background?: unknown;
  payload?: Partial<Record<ImportanceTier, number>>;
  value?: unknown;
};

/** Only the outermost segments of the stack get rounded corners. */
function cashFlowExpenseBarShape(tier: ImportanceTier) {
  return function CashFlowExpenseBarShape(props: unknown) {
    const { background, payload, value, ...shapeProps } = props as CashFlowBarShapeProps;
    void background;
    void value;

    const row = payload ?? {};
    const isTop = getTopExpenseTier(row) === tier;
    const isBottom = getBottomExpenseTier(row) === tier;

    return <Rectangle {...shapeProps} radius={[isTop ? 4 : 0, isTop ? 4 : 0, isBottom ? 4 : 0, isBottom ? 4 : 0]} />;
  };
}

type CashFlowTooltipPayload = {
  color?: string;
  dataKey?: string | number;
  payload?: Partial<Record<"expense" | "income" | "net" | ImportanceTier, number>>;
  value?: unknown;
};

const emptyRow: Exclude<CashFlowTooltipPayload["payload"], undefined> = {};

function CashFlowTooltipContent({
  active,
  baseCurrency,
  label,
  payload,
}: {
  active?: boolean;
  baseCurrency: string;
  label?: string | number;
  payload?: CashFlowTooltipPayload[];
}) {
  const row = payload ? (payload[0]?.payload ?? emptyRow) : emptyRow;
  const totalExpense = row.expense ?? 0;
  const tierRows = useMemo(
    () =>
      [...IMPORTANCE_TIERS].reverse().map((tier) => ({
        color: IMPORTANCE_STYLE[tier].chartColor,
        label: IMPORTANCE_STYLE[tier].label,
        percent: totalExpense > 0 ? ((row[tier] ?? 0) / totalExpense) * 100 : 0,
        value: row[tier] ?? 0,
      })),
    [row, totalExpense],
  );

  if (!active || !payload?.length) {
    return null;
  }

  const rows = [
    { color: "var(--color-income)", label: "Income", value: row.income ?? 0 },
    { color: "var(--color-expense)", label: "Expenses", value: row.expense ?? 0 },
    { color: "var(--color-net)", label: "Net", value: row.net ?? 0 },
  ];

  return (
    <div className="grid min-w-48 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      {label ? <div className="font-medium">{label}</div> : null}
      <div className="grid gap-1.5">
        {rows.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="ml-auto font-medium font-mono text-foreground tabular-nums">
              {formatBalance(item.value, baseCurrency)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 grid gap-1.5 border-t pt-1.5">
        {tierRows.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">
              {item.label} <span className="text-muted-foreground/70">({item.percent.toFixed(0)}%)</span>
            </span>
            <span className="ml-auto font-medium font-mono text-foreground tabular-nums">
              {formatBalance(item.value, baseCurrency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DailySpendingTooltipPayload = {
  payload?: DailySpendingPoint;
};

function DailySpendingTooltipContent({
  active,
  baseCurrency,
  payload,
}: {
  active?: boolean;
  baseCurrency: string;
  payload?: DailySpendingTooltipPayload[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) {
    return null;
  }

  return (
    <div className="grid min-w-48 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{row.dateLabel}</div>
      {row.categories.length > 0 ? (
        <div className="grid gap-1.5">
          {row.categories.map((item, index) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: CATEGORY_DONUT_PALETTE[index % CATEGORY_DONUT_PALETTE.length] }}
              />
              <span className="text-muted-foreground">{item.name}</span>
              <span className="ml-auto font-medium font-mono text-foreground tabular-nums">
                {formatBalance(item.value, baseCurrency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground">No spending</div>
      )}
      <div className="mt-1 flex items-center gap-2 border-t pt-1.5">
        <span className="text-muted-foreground">Total</span>
        <span className="ml-auto font-medium font-mono text-foreground tabular-nums">
          {formatBalance(row.total, baseCurrency)}
        </span>
      </div>
    </div>
  );
}

const netWorthConfig = { netWorth: { label: "Net worth", color: FLOW_COLOR.netWorth } };

function NetWorthTooltip({
  active,
  payload,
  baseCurrency,
}: {
  active?: boolean;
  payload?: { payload?: NetWorthPoint }[];
  baseCurrency: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="grid gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{point.label}</div>
      <div className="font-mono tabular-nums">
        {point.netWorth === null ? "Exchange rate unavailable" : formatBalance(point.netWorth, baseCurrency)}
      </div>
      {point.estimatedCurrencies > 0 && (
        <div className="text-muted-foreground">Uses exchange rates from a nearby date.</div>
      )}
    </div>
  );
}

function NetWorthChart({ buckets, baseCurrency }: { buckets: TrendBucket[]; baseCurrency: string }) {
  const { data, refresh } = useDbQuery<NetWorthPoint>(netWorthQuery({ buckets, baseCurrency }));

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(refreshVisible, 60_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);

  return (
    <div>
      <ChartContainer config={netWorthConfig} className="aspect-auto h-64 w-full">
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompactNumber} />
          <ChartTooltip filterNull={false} content={<NetWorthTooltip baseCurrency={baseCurrency} />} />
          <Area
            dataKey="netWorth"
            type="monotone"
            stroke="var(--color-netWorth)"
            fill="var(--color-netWorth)"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
      {data.some((point) => point.missingCurrencies > 0) && (
        <p className="mt-2 text-muted-foreground text-xs">
          Some points are unavailable because exchange rates are missing.
        </p>
      )}
    </div>
  );
}

/**
 * The three overview charts. Imported lazily by the overview page so recharts
 * stays out of the finances entry chunk.
 */
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
    const hasData = flowData.some((point) => point.income !== 0 || point.expense !== 0);
    if (!hasData) {
      return <ChartEmptyState>No income or expenses in this period.</ChartEmptyState>;
    }

    return (
      <ChartContainer config={flowConfig} className="aspect-auto h-64 w-full">
        <ComposedChart data={flowData} margin={{ left: 4, right: 12, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompactNumber} />
          <ChartTooltip content={<CashFlowTooltipContent baseCurrency={baseCurrency} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="income" fill="var(--color-income)" radius={4} />
          {IMPORTANCE_TIERS.map((tier) => (
            <Bar
              key={tier}
              dataKey={tier}
              stackId="expense"
              fill={`var(--color-${tier})`}
              shape={cashFlowExpenseBarShape(tier)}
            />
          ))}
        </ComposedChart>
      </ChartContainer>
    );
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

  return (
    <ChartContainer config={spendingConfig} className="aspect-auto h-64 w-full">
      <BarChart data={dailySpending} margin={{ left: 4, right: 12, top: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompactNumber} />
        <ChartTooltip content={<DailySpendingTooltipContent baseCurrency={baseCurrency} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
