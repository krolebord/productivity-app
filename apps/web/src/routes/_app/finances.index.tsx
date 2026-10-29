import { type DashboardRangeMode, resolveDashboardRange } from "@productivity/core/dashboard-range-store";
import { useAccounts } from "@productivity/core/data/accounts";
import {
  useExpenseEntries,
  useFlowTotalsByCurrency,
  useIncomeAndExpenseEntries,
  useRecentTransactions,
} from "@productivity/core/data/transactions";
import {
  buildCashFlowSeries,
  buildDailyBuckets,
  buildDailySpendingSeries,
  buildTrendBuckets,
  sumFlowTotals,
  sumNetWorth,
  trailingDailyRange,
} from "@productivity/core/finance/overview";
import { MAX_SPENDING_DAYS, spendingDaysForWidth } from "@productivity/core/finance/spending-days";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCwIcon, SettingsIcon } from "lucide-react";
import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CurrencySelect } from "@/components/currency-select";
import { DashboardRangeSelect } from "@/components/dashboard-range-select";
import { AccountsOverviewCard } from "@/components/finances/accounts-overview-card";
import type { OverviewChart } from "@/components/finances/overview-charts";
import { RecentActivityCard } from "@/components/finances/recent-activity-card";
import { FinanceSummaryCards } from "@/components/finances/summary-cards";
import { PageToolbar, SectionCard } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRefreshRates } from "@/lib/currency/use-refresh-rates";
import { useDashboardSettings } from "@/lib/dashboard-settings";
import { useDisplayCurrency } from "@/lib/finance/display-currency";
import { useCurrentDayKey } from "@/lib/use-current-day";
import { cn } from "@/lib/utils";

// Charts pull in recharts, which is far bigger than the rest of this page.
const OverviewCharts = lazy(() =>
  import("@/components/finances/overview-charts").then((module) => ({ default: module.OverviewCharts })),
);

export const Route = createFileRoute("/_app/finances/")({
  component: FinancesPage,
});

const RECENT_LIMIT = 12;
const TREND_BUCKETS = 6;

const CHART_TABS = [
  { id: "flow", label: "Cash flow" },
  { id: "networth", label: "Net worth" },
  { id: "spending", label: "Spending" },
] as const satisfies readonly { id: OverviewChart; label: string }[];

function useDashboardRange(rangeMode: DashboardRangeMode, rangeDays: number, rangeCycleDay: number) {
  const currentDayKey = useCurrentDayKey();

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentDayKey only exists so an overnight tab recomputes instead of pinning the day it was opened.
  return useMemo(() => {
    const now = new Date();
    const buckets = buildTrendBuckets({ mode: rangeMode, cycleDay: rangeCycleDay, count: TREND_BUCKETS, now });
    const range = resolveDashboardRange({ mode: rangeMode, days: rangeDays, cycleDay: rangeCycleDay }, now);

    return {
      ...range,
      rangeLabel: range.label,
      trendBuckets: buckets,
      trendPeriodLabel: rangeMode === "cycle" ? "cycles" : "months",
      windowStart: buckets[0].start,
      nowTs: now.getTime(),
    };
  }, [rangeMode, rangeDays, rangeCycleDay, currentDayKey]);
}

function useColumnWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const update = () => setWidth(node.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function FinancesPage() {
  const { mode: rangeMode, days: rangeDays, cycleDay: rangeCycleDay } = useDashboardSettings();
  const { baseCurrency, setBaseCurrency, latestRate, convert, currencyOptions } = useDisplayCurrency();
  const { refreshRates, isRefreshing } = useRefreshRates();
  const [activeChart, setActiveChart] = useState<OverviewChart>("flow");
  const { ref: columnRef, width: columnWidth } = useColumnWidth();
  const spendingDays = spendingDaysForWidth(columnWidth);

  const {
    rangeStart,
    rangeEnd,
    prevRangeStart,
    prevRangeEnd,
    spanLabel,
    cardSuffix,
    prevLabel,
    trendBuckets,
    trendPeriodLabel,
    windowStart,
    nowTs,
  } = useDashboardRange(rangeMode, rangeDays, rangeCycleDay);

  const allAccounts = useAccounts();

  const includedAccounts = useMemo(() => allAccounts.filter((a) => !a.excludeFromDashboard), [allAccounts]);
  const excludedIds = useMemo(() => allAccounts.filter((a) => a.excludeFromDashboard).map((a) => a.id), [allAccounts]);
  const excludedAccountIds = useMemo(() => new Set(excludedIds), [excludedIds]);

  const rangeRows = useFlowTotalsByCurrency({ start: rangeStart, end: rangeEnd, excludedAccountIds: excludedIds });
  const prevRangeRows = useFlowTotalsByCurrency({
    start: prevRangeStart,
    end: prevRangeEnd,
    excludedAccountIds: excludedIds,
  });

  const spendingLookback = trailingDailyRange(MAX_SPENDING_DAYS, new Date(nowTs));
  const spendingVisible = trailingDailyRange(spendingDays, new Date(nowTs));

  const dailyExpenseRows = useExpenseEntries({ ...spendingLookback, excludedAccountIds: excludedIds });

  const windowRows = useIncomeAndExpenseEntries({
    start: windowStart,
    end: trendBuckets[trendBuckets.length - 1].end,
  });

  const recent = useRecentTransactions({ limit: RECENT_LIMIT, excludedAccountIds: excludedIds });

  const { netWorth, unconvertibleAccounts } = sumNetWorth(includedAccounts, convert);
  const flow = sumFlowTotals(rangeRows, convert);
  const prevFlow = sumFlowTotals(prevRangeRows, convert);

  const flowData = buildCashFlowSeries({ rows: windowRows, buckets: trendBuckets, convert, excludedAccountIds });
  const dailySpending = buildDailySpendingSeries({
    rows: dailyExpenseRows,
    buckets: buildDailyBuckets(spendingVisible.start, spendingVisible.end),
    convert,
    excludedAccountIds,
  });

  const accountMap = useMemo(() => new Map(allAccounts.map((account) => [account.id, account])), [allAccounts]);

  const chartTitle =
    activeChart === "flow"
      ? `Cash flow · last ${TREND_BUCKETS} ${trendPeriodLabel}`
      : activeChart === "networth"
        ? `Net worth · last ${TREND_BUCKETS} ${trendPeriodLabel}`
        : `Spending per day · last ${spendingDays} days`;

  const displayCurrencySelect = (className: string) => (
    <CurrencySelect
      value={baseCurrency}
      currencies={currencyOptions}
      onChange={setBaseCurrency}
      className={className}
    />
  );

  return (
    <div ref={columnRef} className="flex flex-col gap-6">
      <PageToolbar className="justify-between">
        <p className="font-medium text-sm">{spanLabel}</p>
        <div className="@xl:flex hidden flex-wrap items-center gap-2">
          <DashboardRangeSelect />
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Display in</span>
          {displayCurrencySelect("w-40")}
        </div>
        <div className="@xl:hidden">
          <Popover>
            <PopoverTrigger render={<Button size="icon" variant="ghost" aria-label="Overview settings" />}>
              <SettingsIcon className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-64 flex-col gap-3">
              <DashboardRangeSelect className="w-full" />
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Display in</span>
                {displayCurrencySelect("w-full")}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </PageToolbar>

      {!latestRate && (
        <div className="flex @md:flex-row flex-col items-start @md:items-center @md:justify-between gap-2 rounded-lg border border-dashed bg-card px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            No exchange rates stored yet. Totals only count accounts already in {baseCurrency}.
          </p>
          <Button onClick={refreshRates} size="sm" variant="outline" disabled={isRefreshing}>
            <RefreshCwIcon className={isRefreshing ? "animate-spin" : undefined} />
            Refresh rates
          </Button>
        </div>
      )}

      <FinanceSummaryCards
        accountCount={includedAccounts.length}
        baseCurrency={baseCurrency}
        cardSuffix={cardSuffix}
        flow={flow}
        netDelta={flow.net - prevFlow.net}
        netWorth={netWorth}
        prevLabel={prevLabel}
        unconvertibleAccounts={unconvertibleAccounts}
      />

      <SectionCard
        title={chartTitle}
        actionsClassName="w-full @lg:w-auto"
        actions={
          <div
            role="group"
            aria-label="Overview chart"
            className="flex w-full @lg:inline-flex rounded-md border bg-muted/50 p-0.5"
          >
            {CHART_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={activeChart === tab.id}
                onClick={() => setActiveChart(tab.id)}
                className={cn(
                  "@lg:flex-none flex-1 rounded px-3 py-1 font-medium text-sm transition-colors",
                  activeChart === tab.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-4"
      >
        <Suspense fallback={<div className="h-64" />}>
          <OverviewCharts
            activeChart={activeChart}
            baseCurrency={baseCurrency}
            dailySpending={dailySpending}
            flowData={flowData}
            hasAccounts={includedAccounts.length > 0}
            trendBuckets={trendBuckets}
          />
        </Suspense>
      </SectionCard>

      <div className="grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-cols-[minmax(0,1fr)] gap-4">
        <RecentActivityCard accounts={accountMap} baseCurrency={baseCurrency} convert={convert} transactions={recent} />
        <AccountsOverviewCard baseCurrency={baseCurrency} convert={convert} />
      </div>
    </div>
  );
}
