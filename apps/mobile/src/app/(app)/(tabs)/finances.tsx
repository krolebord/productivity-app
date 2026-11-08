import { formatBalance } from "@productivity/core/currency/format";
import { resolveDashboardRange } from "@productivity/core/dashboard-range-store";
import { useAccounts } from "@productivity/core/data/accounts";
import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
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
import { formatShortDayHeader, groupTransactionsByDay } from "@productivity/core/finance/transaction-list";
import { useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
// RNGH's scroll view, so an account row being dragged takes over from scrolling.
import { ScrollView } from "react-native-gesture-handler";
import { AccountList } from "../../../components/account-list";
import { useTabContentInset } from "../../../components/assistant-button";
import { CurrencySheet } from "../../../components/currency-field";
import { DashboardRangePicker } from "../../../components/dashboard-range-picker";
import { GlobalActions } from "../../../components/global-actions";
import { type OverviewChart, OverviewCharts } from "../../../components/overview-charts";
import { ScreenHeader, SheetHeader } from "../../../components/screen-header";
import { TransactionRow } from "../../../components/transaction-row";
import { ActionSheet } from "../../../components/ui/action-sheet";
import { FormSheet } from "../../../components/ui/form-sheet";
import { Icon, type IconName } from "../../../components/ui/icon";
import { IconButton } from "../../../components/ui/icon-button";
import { StatusNotice } from "../../../components/ui/notice";
import { Segmented } from "../../../components/ui/segmented";
import { amountAccentClass, TRANSACTION_TYPE_STYLE, useDisplayCurrency } from "../../../lib/finance";
import { useCurrentDayKey } from "../../../lib/use-current-day";
import { useRefreshBalances, useRefreshRates } from "../../../lib/use-finance-refresh";
import { cn } from "../../../lib/utils";

const RECENT_LIMIT = 12;
const TREND_BUCKETS = 6;

const CHART_TABS = [
  { value: "flow", label: "Cash flow" },
  { value: "networth", label: "Net worth" },
  { value: "spending", label: "Spending" },
] as const satisfies readonly { value: OverviewChart; label: string }[];

const QUICK_ACTIONS = ["expense", "income", "transfer"] as const;

export default function FinancesScreen() {
  const contentInset = useTabContentInset();
  const router = useRouter();
  const currentDayKey = useCurrentDayKey();
  const { mode, days, cycleDay } = useDashboardSettings();
  const { baseCurrency, setBaseCurrency, latestRate, convert, currencyOptions } = useDisplayCurrency();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rates = useRefreshRates();
  const balances = useRefreshBalances();

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentDayKey only exists so the range rolls over at midnight.
  const range = useMemo(() => {
    const now = new Date();
    return {
      ...resolveDashboardRange({ mode, days, cycleDay }, now),
      trendBuckets: buildTrendBuckets({ mode, cycleDay, count: TREND_BUCKETS, now }),
      trendPeriodLabel: mode === "cycle" ? "cycles" : "months",
      nowTs: now.getTime(),
    };
  }, [mode, days, cycleDay, currentDayKey]);
  const [activeChart, setActiveChart] = useState<OverviewChart>("flow");
  const [chartWidth, setChartWidth] = useState(0);
  const spendingDays = spendingDaysForWidth(chartWidth);

  const accounts = useAccounts();
  const included = useMemo(() => accounts.filter((a) => !a.excludeFromDashboard), [accounts]);
  const excludedIds = useMemo(() => accounts.filter((a) => a.excludeFromDashboard).map((a) => a.id), [accounts]);
  const excludedAccountIds = useMemo(() => new Set(excludedIds), [excludedIds]);
  const accountLabels = useMemo(() => new Map(accounts.map((a) => [a.id, a.labelText])), [accounts]);
  const hiddenCount = excludedIds.length;

  const rangeRows = useFlowTotalsByCurrency({
    start: range.rangeStart,
    end: range.rangeEnd,
    excludedAccountIds: excludedIds,
  });
  const prevRows = useFlowTotalsByCurrency({
    start: range.prevRangeStart,
    end: range.prevRangeEnd,
    excludedAccountIds: excludedIds,
  });
  const recent = useRecentTransactions({ limit: RECENT_LIMIT, excludedAccountIds: excludedIds });
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentDayKey re-labels Today/Yesterday at midnight.
  const recentGroups = useMemo(() => groupTransactionsByDay(recent, "date_desc"), [recent, currentDayKey]);

  const spendingLookback = trailingDailyRange(MAX_SPENDING_DAYS, new Date(range.nowTs));
  const spendingVisible = trailingDailyRange(spendingDays, new Date(range.nowTs));
  const dailyExpenseRows = useExpenseEntries({ ...spendingLookback, excludedAccountIds: excludedIds });
  const windowRows = useIncomeAndExpenseEntries({
    start: range.trendBuckets[0].start,
    end: range.trendBuckets[range.trendBuckets.length - 1].end,
  });

  const { netWorth, unconvertibleAccounts } = sumNetWorth(included, convert);
  const flow = sumFlowTotals(rangeRows, convert);
  const prevFlow = sumFlowTotals(prevRows, convert);
  const netDelta = flow.net - prevFlow.net;

  const flowData = buildCashFlowSeries({ rows: windowRows, buckets: range.trendBuckets, convert, excludedAccountIds });
  const dailySpending = buildDailySpendingSeries({
    rows: dailyExpenseRows,
    buckets: buildDailyBuckets(spendingVisible.start, spendingVisible.end),
    convert,
    excludedAccountIds,
  });

  const chartCaption =
    activeChart === "flow"
      ? `Income and expenses · last ${TREND_BUCKETS} ${range.trendPeriodLabel}`
      : activeChart === "networth"
        ? `Last ${TREND_BUCKETS} ${range.trendPeriodLabel}`
        : `Per day · last ${spendingDays} days`;

  const newTransaction = (type: (typeof QUICK_ACTIONS)[number]) =>
    router.push({ pathname: "/transaction/[id]", params: { id: "new", type } });
  const newAccount = () => router.push({ pathname: "/account/[id]", params: { id: "new" } });
  const openAccount = (accountId: string) => router.push({ pathname: "/transactions", params: { accountId } });
  // Carries the overview's period into the ledger, as the web's "View all" does.
  const viewAll = () =>
    router.push({
      pathname: "/transactions",
      params: { from: String(range.rangeStart), to: String(range.rangeEnd) },
    });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Finances"
        subtitle={range.spanLabel}
        actions={
          <>
            <GlobalActions />
            <IconButton icon="more-horizontal" label="More actions" onPress={() => setMenuOpen(true)} />
          </>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 4, paddingBottom: contentInset }}
        scrollEnabled={!dragging}
        keyboardDismissMode="on-drag"
      >
        <View className="gap-3">
          <View className="flex-row gap-2">
            {QUICK_ACTIONS.map((type, index) => (
              <QuickAction key={type} type={type} primary={index === 0} onPress={() => newTransaction(type)} />
            ))}
          </View>
          <StatusNotice
            status={rates.status}
            pendingLabel="Refreshing exchange rates…"
            onRetry={rates.refresh}
            onDismiss={rates.reset}
          />
          <StatusNotice status={balances.status} pendingLabel="Refreshing balances…" onDismiss={balances.reset} />
        </View>

        {!latestRate && (
          <Text className="rounded-lg border border-border border-dashed px-4 py-3 text-muted-foreground text-sm">
            No exchange rates stored yet. Totals only count accounts already in {baseCurrency}.
          </Text>
        )}

        <View className="gap-1 px-1">
          <Text className="text-muted-foreground text-sm">Net worth</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit className="font-semibold text-4xl text-foreground">
            {formatBalance(netWorth, baseCurrency)}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {`${included.length} account${included.length === 1 ? "" : "s"}${
              unconvertibleAccounts > 0 ? ` · ${unconvertibleAccounts} not converted` : ""
            }`}
          </Text>
        </View>

        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="font-medium text-foreground text-sm">{range.label}</Text>
          <View className="flex-row gap-3">
            <FlowStat
              label="Income"
              dotClassName="bg-emerald-500"
              value={formatBalance(flow.income, baseCurrency)}
              valueClassName={flow.income === 0 ? undefined : TRANSACTION_TYPE_STYLE.income.accent}
            />
            <FlowStat
              label="Expenses"
              dotClassName="bg-rose-500"
              value={formatBalance(flow.expense, baseCurrency)}
              valueClassName={flow.expense === 0 ? undefined : TRANSACTION_TYPE_STYLE.expense.accent}
            />
            <FlowStat
              label="Net"
              value={formatBalance(flow.net, baseCurrency)}
              valueClassName={amountAccentClass(flow.net)}
            />
          </View>
          <View className="flex-row items-center gap-1.5 border-border border-t pt-3">
            <Icon
              name={netDelta >= 0 ? "trending-up" : "trending-down"}
              size={13}
              colorClassName="accent-muted-foreground"
            />
            <Text className="text-muted-foreground text-xs">
              {`Net ${netDelta >= 0 ? "+" : "−"}${formatBalance(Math.abs(netDelta), baseCurrency)} vs ${range.prevLabel}`}
            </Text>
          </View>
        </View>

        <Section
          title="Accounts"
          action={
            <View className="flex-row items-center gap-1">
              {hiddenCount > 0 && (
                <Text className="text-muted-foreground text-xs">{hiddenCount} hidden from totals</Text>
              )}
              <IconButton icon="plus" label="New account" onPress={newAccount} size={18} />
            </View>
          }
        >
          <View className="overflow-hidden rounded-xl border border-border bg-card">
            {accounts.length === 0 ? (
              <CardEmptyState
                icon="credit-card"
                title="No accounts yet"
                description="Create one to start tracking your finances."
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={newAccount}
                  className="mt-2 h-9 flex-row items-center gap-1.5 rounded-lg border border-border px-3 active:bg-muted"
                >
                  <Icon name="plus" size={14} colorClassName="accent-foreground" />
                  <Text className="font-medium text-foreground text-sm">New account</Text>
                </Pressable>
              </CardEmptyState>
            ) : (
              <AccountList
                baseCurrency={baseCurrency}
                convert={convert}
                onOpen={openAccount}
                onDraggingChange={setDragging}
              />
            )}
          </View>
        </Section>

        <View
          className="gap-3 rounded-xl border border-border bg-card p-3"
          onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
        >
          <Segmented options={CHART_TABS} value={activeChart} onChange={setActiveChart} />
          <Text className="px-1 text-muted-foreground text-xs">{chartCaption}</Text>
          <OverviewCharts
            activeChart={activeChart}
            baseCurrency={baseCurrency}
            dailySpending={dailySpending}
            flowData={flowData}
            hasAccounts={included.length > 0}
            trendBuckets={range.trendBuckets}
          />
        </View>

        <Section
          title="Recent activity"
          action={
            <Pressable accessibilityRole="button" onPress={viewAll} hitSlop={8}>
              <Text className="font-medium text-primary text-sm">View all</Text>
            </Pressable>
          }
        >
          {recentGroups.length === 0 ? (
            <View className="overflow-hidden rounded-xl border border-border bg-card">
              <CardEmptyState icon="list" title="No transactions yet." />
            </View>
          ) : (
            <View className="gap-4">
              {recentGroups.map((group) => (
                <View key={group.key} className="gap-2">
                  {group.timestamp !== null && (
                    <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {formatShortDayHeader(group.timestamp)}
                    </Text>
                  )}
                  <View className="overflow-hidden rounded-xl border border-border bg-card">
                    {group.transactions.map((transaction, index) => (
                      <TransactionRow
                        key={transaction.id}
                        transaction={transaction}
                        accountLabels={accountLabels}
                        baseCurrency={baseCurrency}
                        convert={convert}
                        timeOnly
                        onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: transaction.id } })}
                        last={index === group.transactions.length - 1}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>
      {/* Workspace-level actions, as the web's finance header menu. */}
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          // Set-and-forget settings, so they live here rather than above the overview.
          { label: `Period · ${range.label}`, icon: "calendar", onPress: () => setRangeOpen(true) },
          { label: `Display currency · ${baseCurrency}`, icon: "globe", onPress: () => setCurrencyOpen(true) },
          { label: "Exchange rates", icon: "dollar-sign", onPress: () => router.push("/rates") },
          { label: "Refresh balances", icon: "refresh-cw", onPress: balances.refresh },
          {
            label: "Refresh rates",
            icon: "trending-up",
            onPress: rates.refresh,
            disabled: rates.status.state === "pending",
          },
        ]}
      />
      <FormSheet isOpen={rangeOpen} onNativeDismiss={() => setRangeOpen(false)}>
        <View>
          <SheetHeader title="Overview period" onDone={() => setRangeOpen(false)} />
          <View className="p-4">
            <DashboardRangePicker />
          </View>
        </View>
      </FormSheet>
      <CurrencySheet
        visible={currencyOpen}
        title="Display currency"
        value={baseCurrency}
        currencies={currencyOptions}
        onChange={setBaseCurrency}
        onClose={() => setCurrencyOpen(false)}
      />
    </View>
  );
}

/** Expense / Income / Transfer, opening the editor preset to that type, as the web header's trio. */
function QuickAction({
  type,
  primary,
  onPress,
}: {
  type: (typeof QUICK_ACTIONS)[number];
  primary: boolean;
  onPress: () => void;
}) {
  const style = TRANSACTION_TYPE_STYLE[type];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`New ${style.label.toLowerCase()}`}
      onPress={onPress}
      className={cn(
        "h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg active:opacity-80",
        primary ? "bg-primary" : "border border-border bg-card",
      )}
    >
      <Icon name={style.icon} size={15} colorClassName={primary ? "accent-primary-foreground" : style.iconAccent} />
      <Text className={cn("font-medium text-sm", primary ? "text-primary-foreground" : "text-foreground")}>
        {style.label}
      </Text>
    </Pressable>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className="h-8 flex-row items-center justify-between px-1">
        <Text className="font-semibold text-foreground text-lg">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function CardEmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <View className="items-center gap-1 px-6 py-8">
      <Icon name={icon} size={22} colorClassName="accent-muted-foreground" />
      <Text className="mt-1 font-medium text-foreground text-sm">{title}</Text>
      {description && <Text className="text-center text-muted-foreground text-sm">{description}</Text>}
      {children}
    </View>
  );
}

function FlowStat({
  label,
  dotClassName,
  value,
  valueClassName = "text-card-foreground",
}: {
  label: string;
  dotClassName?: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-1.5">
        {dotClassName && <View className={cn("size-2 rounded-full", dotClassName)} />}
        <Text className="text-muted-foreground text-xs">{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit className={cn("font-semibold text-lg", valueClassName)}>
        {value}
      </Text>
    </View>
  );
}
