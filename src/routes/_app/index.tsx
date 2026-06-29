import { createFileRoute, Link } from "@tanstack/react-router";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  SettingsIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { formatBalance } from "@/components/account-card";
import { CurrencySelect } from "@/components/currency-select";
import { DashboardRangeSelect } from "@/components/dashboard-range-select";
import {
  useCreateExpense,
  useCreateIncome,
  useCreateTransfer,
  useTransactionDialogStore,
} from "@/components/transaction-dialog";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBaseCurrencyStore } from "@/lib/base-currency-store";
import { convertAmount, getCurrencyOptions } from "@/lib/currency/convert";
import { APP_CURRENCIES } from "@/lib/currency/currencies";
import { resolveDashboardRange, useDashboardRangeStore } from "@/lib/dashboard-range-store";
import { formatDateTimeDisplay } from "@/lib/date-time";
import {
  getDisplayAmountForAccount,
  IMPORTANCE_TIERS,
  type ImportanceTier,
  type TransactionType,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { useDb, useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

const RECENT_LIMIT = 12;
const TOP_CATEGORIES = 6;
const TREND_MONTHS = 6;

const CHART_TABS = [
  { id: "flow", label: "Cash flow" },
  { id: "networth", label: "Net worth" },
  { id: "spending", label: "Spending" },
] as const;

type ChartTab = (typeof CHART_TABS)[number]["id"];

// Per-importance styling for the cash-flow expense stack: shades of red, darkest
// for the most-required tier and lightening toward investments.
const IMPORTANCE_FLOW = {
  fixed: { label: "Fixed", color: "#991b1b" },
  flexible: { label: "Flexible", color: "#ef4444" },
  optional: { label: "Optional", color: "#f87171" },
  investment: { label: "Invest", color: "#fca5a5" },
} satisfies Record<ImportanceTier, { label: string; color: string }>;

const DONUT_PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const TYPE_ICON = {
  expense: ArrowDownLeftIcon,
  income: ArrowUpRightIcon,
  transfer: ArrowLeftRightIcon,
  adjustment: PlusIcon,
} satisfies Record<TransactionType, typeof ArrowDownLeftIcon>;

const TYPE_ACCENT = {
  expense: "text-rose-600 dark:text-rose-400",
  income: "text-emerald-600 dark:text-emerald-400",
  transfer: "text-blue-600 dark:text-blue-400",
  adjustment: "text-amber-600 dark:text-amber-400",
} satisfies Record<TransactionType, string>;

function amountClass(amount: number) {
  if (amount > 0) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (amount < 0) {
    return "text-rose-600 dark:text-rose-400";
  }
  return "text-foreground";
}

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function DashboardPage() {
  const db = useDb();
  const { baseCurrency, setBaseCurrency } = useBaseCurrencyStore();
  const openEdit = useTransactionDialogStore((state) => state.openEdit);
  const createExpense = useCreateExpense();
  const createIncome = useCreateIncome();
  const createTransfer = useCreateTransfer();
  const [activeChart, setActiveChart] = useState<ChartTab>("flow");
  const rangeMode = useDashboardRangeStore((s) => s.mode);
  const rangeDays = useDashboardRangeStore((s) => s.days);
  const rangeCycleDay = useDashboardRangeStore((s) => s.cycleDay);

  // Compute time boundaries so the queries below stay stable across renders
  // (instead of refetching on every tick) and only recompute when the chosen
  // range changes. `months` are the trailing buckets used by the trend charts,
  // oldest first; the last entry is the current (partial) month.
  const {
    rangeStart,
    rangeEnd,
    prevRangeStart,
    prevRangeEnd,
    rangeLabel,
    cardSuffix,
    prevLabel,
    months,
    windowStart,
    nowTs,
  } = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: TREND_MONTHS }, (_, i) => {
      const d = subMonths(now, TREND_MONTHS - 1 - i);
      return {
        label: format(d, "MMM"),
        start: startOfMonth(d).getTime(),
        end: endOfMonth(d).getTime(),
      };
    });
    // Summary cards + spending donut follow the user-selected range; the
    // preceding window of equal shape drives the period-over-period delta.
    const range = resolveDashboardRange({ mode: rangeMode, days: rangeDays, cycleDay: rangeCycleDay }, now);
    return {
      ...range,
      rangeLabel: range.label,
      months: buckets,
      windowStart: buckets[0].start,
      nowTs: now.getTime(),
    };
  }, [rangeMode, rangeDays, rangeCycleDay]);

  const { data: allAccounts } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"));

  // Accounts flagged out of the dashboard are dropped from every metric below.
  // `accounts` drives net worth and the accounts list; `excludedIds` filters the
  // transaction-based queries (income/spend, charts, recent activity).
  const accounts = useMemo(() => allAccounts.filter((a) => !a.excludeFromDashboard), [allAccounts]);
  const excludedIds = useMemo(() => allAccounts.filter((a) => a.excludeFromDashboard).map((a) => a.id), [allAccounts]);
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);

  const { data: rates } = useDbQuery((db) =>
    db.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc").limit(1),
  );
  const latestRate = rates[0];

  const { data: rangeRows } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select((eb) => ["type", "accountCurrency", eb.fn.sum<number>("amount").as("total")])
      .where("effectiveAt", ">=", rangeStart)
      .where("effectiveAt", "<=", rangeEnd)
      .$if(excludedIds.length > 0, (qb) => qb.where("accountId", "not in", excludedIds))
      .groupBy(["type", "accountCurrency"]),
  );

  const { data: prevRangeRows } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select((eb) => ["type", "accountCurrency", eb.fn.sum<number>("amount").as("total")])
      .where("effectiveAt", ">=", prevRangeStart)
      .where("effectiveAt", "<=", prevRangeEnd)
      .$if(excludedIds.length > 0, (qb) => qb.where("accountId", "not in", excludedIds))
      .groupBy(["type", "accountCurrency"]),
  );

  const { data: categoryRows } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select((eb) => ["category", "accountCurrency", eb.fn.sum<number>("amount").as("total")])
      .where("type", "=", "expense")
      .where("effectiveAt", ">=", rangeStart)
      .where("effectiveAt", "<=", rangeEnd)
      .$if(excludedIds.length > 0, (qb) => qb.where("accountId", "not in", excludedIds))
      .groupBy(["category", "accountCurrency"]),
  );

  // Raw rows for the trend window — flow buckets and net-worth reconstruction
  // both derive from this, so we only pull it once.
  const { data: windowRows } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select([
        "effectiveAt",
        "type",
        "accountId",
        "accountCurrency",
        "amount",
        "importance",
        "counterpartyAccountId",
        "counterpartyCurrency",
        "counterpartyAmount",
      ])
      .where("effectiveAt", ">=", windowStart),
  );

  const { data: recent } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .selectAll()
      .$if(excludedIds.length > 0, (qb) => qb.where("accountId", "not in", excludedIds))
      .orderBy("effectiveAt", "desc")
      .orderBy("createdAt", "desc")
      .limit(RECENT_LIMIT),
  );

  const currencyOptions = latestRate ? getCurrencyOptions(latestRate) : APP_CURRENCIES;

  // Convert a native amount into the chosen base. Returns null when rates are
  // missing for either currency so callers can flag unconvertible totals.
  const toBase = useMemo(() => {
    return (amount: number, currency: string): number | null => {
      if (currency === baseCurrency) {
        return amount;
      }
      if (!latestRate) {
        return null;
      }
      return convertAmount(latestRate, amount, currency, baseCurrency);
    };
  }, [latestRate, baseCurrency]);

  // Net worth across all accounts, converted to the base currency.
  let netWorth = 0;
  let unconvertibleAccounts = 0;
  const nowByCurrency = new Map<string, number>();
  for (const account of accounts) {
    nowByCurrency.set(account.currency, (nowByCurrency.get(account.currency) ?? 0) + Number(account.balance));
    const converted = toBase(Number(account.balance), account.currency);
    if (converted === null) {
      unconvertibleAccounts += 1;
    } else {
      netWorth += converted;
    }
  }

  function sumFlow(rows: typeof rangeRows) {
    let income = 0;
    let expense = 0;
    for (const row of rows) {
      const total = toBase(Number(row.total ?? 0), row.accountCurrency);
      if (total === null) {
        continue;
      }
      if (row.type === "income") {
        income += total;
      } else if (row.type === "expense") {
        expense += Math.abs(total);
      }
    }
    return { income, expense, net: income - expense };
  }

  const last30 = sumFlow(rangeRows);
  const prev30 = sumFlow(prevRangeRows);
  const netDelta = last30.net - prev30.net;

  // Spending by category for the last 30 days, aggregated in the base currency.
  const categoryTotals = new Map<string, number>();
  for (const row of categoryRows) {
    const total = toBase(Number(row.total ?? 0), row.accountCurrency);
    if (total === null) {
      continue;
    }
    const key = row.category || "Uncategorized";
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + Math.abs(total));
  }
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CATEGORIES);

  // Cash flow per trend month, in the base currency. Expenses are split across
  // importance tiers for the stacked bar; unclassified expenses count as optional.
  const flowData = months.map((month) => {
    let income = 0;
    let expense = 0;
    const tiers: Record<ImportanceTier, number> = { fixed: 0, flexible: 0, optional: 0, investment: 0 };
    for (const row of windowRows) {
      if (row.effectiveAt < month.start || row.effectiveAt > month.end) {
        continue;
      }
      if (excludedSet.has(row.accountId)) {
        continue;
      }
      const value = toBase(Number(row.amount), row.accountCurrency);
      if (value === null) {
        continue;
      }
      if (row.type === "income") {
        income += value;
      } else if (row.type === "expense") {
        const abs = Math.abs(value);
        expense += abs;
        const tier = row.importance && row.importance in tiers ? (row.importance as ImportanceTier) : "optional";
        tiers[tier] += abs;
      }
    }
    return { month: month.label, income, expense, net: income - expense, ...tiers };
  });
  const flowHasData = flowData.some((d) => d.income !== 0 || d.expense !== 0);

  // Net worth at each month-end, reconstructed by rolling current balances back
  // through the transactions that happened after that point. The current
  // month's point uses live balances. FX uses the latest rates for every point.
  const netWorthData = months.map((month, index) => {
    const boundary = index === months.length - 1 ? nowTs : month.end;
    const deltaByCurrency = new Map<string, number>();
    for (const row of windowRows) {
      if (row.effectiveAt <= boundary) {
        continue;
      }
      // Each transfer row touches two accounts; roll back only the sides that
      // belong to an included account so excluded balances never leak in.
      if (!excludedSet.has(row.accountId)) {
        deltaByCurrency.set(row.accountCurrency, (deltaByCurrency.get(row.accountCurrency) ?? 0) + Number(row.amount));
      }
      if (row.counterpartyCurrency && row.counterpartyAmount !== null && !excludedSet.has(row.counterpartyAccountId)) {
        deltaByCurrency.set(
          row.counterpartyCurrency,
          (deltaByCurrency.get(row.counterpartyCurrency) ?? 0) + Number(row.counterpartyAmount),
        );
      }
    }
    let total = 0;
    for (const currency of new Set([...nowByCurrency.keys(), ...deltaByCurrency.keys()])) {
      const balance = (nowByCurrency.get(currency) ?? 0) - (deltaByCurrency.get(currency) ?? 0);
      const value = toBase(balance, currency);
      if (value !== null) {
        total += value;
      }
    }
    return { month: month.label, netWorth: total };
  });

  // Spending donut data (current month, top categories).
  const categoryData = topCategories.map(([name, value], index) => ({
    name,
    value,
    fill: DONUT_PALETTE[index % DONUT_PALETTE.length],
  }));

  const flowConfig = {
    income: { label: "Income", color: "#10b981" },
    fixed: IMPORTANCE_FLOW.fixed,
    flexible: IMPORTANCE_FLOW.flexible,
    optional: IMPORTANCE_FLOW.optional,
    investment: IMPORTANCE_FLOW.investment,
  } satisfies ChartConfig;

  const netWorthConfig = {
    netWorth: { label: "Net worth", color: "#3b82f6" },
  } satisfies ChartConfig;

  const categoryConfig: ChartConfig = {};
  for (const slice of categoryData) {
    categoryConfig[slice.name] = { label: slice.name, color: slice.fill };
  }

  const accountMap = new Map(allAccounts.map((account) => [account.id, account]));

  const chartTitle =
    activeChart === "flow"
      ? `Cash flow · last ${TREND_MONTHS} months`
      : activeChart === "networth"
        ? `Net worth · last ${TREND_MONTHS} months`
        : `Spending by category · ${rangeLabel.toLowerCase()}`;

  return (
    <div className="@container mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-row items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">Overview</h1>
          <p className="text-muted-foreground text-sm">{rangeLabel}</p>
        </div>
        {/* Settings inline when the panel is wide enough, else collapsed behind a button */}
        <div className="@xl:flex hidden flex-wrap items-center gap-2">
          <DashboardRangeSelect />
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Display in</span>
          <CurrencySelect
            value={baseCurrency}
            currencies={currencyOptions}
            onChange={setBaseCurrency}
            className="w-40"
          />
        </div>
        <div className="@xl:hidden">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Settings">
                <SettingsIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-64 flex-col gap-3">
              <DashboardRangeSelect className="w-full" />
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Display in</span>
                <CurrencySelect
                  value={baseCurrency}
                  currencies={currencyOptions}
                  onChange={setBaseCurrency}
                  className="w-full"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {!latestRate && (
        <div className="flex @md:flex-row flex-col items-start @md:items-center @md:justify-between gap-2 rounded-lg border border-dashed bg-card px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            No exchange rates stored yet. Totals only count accounts already in {baseCurrency}.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/currencies">Refresh rates</Link>
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid @4xl:grid-cols-4 @lg:grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <WalletIcon className="size-4" />
            <p className="text-xs uppercase tracking-wide">Net worth</p>
          </div>
          <p className="mt-2 font-mono font-semibold text-2xl tabular-nums">{formatBalance(netWorth, baseCurrency)}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
            {unconvertibleAccounts > 0 ? ` · ${unconvertibleAccounts} not converted` : ""}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Income ({cardSuffix})</p>
          </div>
          <p className="mt-2 font-mono font-semibold text-2xl text-emerald-600 tabular-nums dark:text-emerald-400">
            {formatBalance(last30.income, baseCurrency)}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-500" />
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Spent ({cardSuffix})</p>
          </div>
          <p className="mt-2 font-mono font-semibold text-2xl text-rose-600 tabular-nums dark:text-rose-400">
            {formatBalance(last30.expense, baseCurrency)}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {netDelta >= 0 ? <TrendingUpIcon className="size-4" /> : <TrendingDownIcon className="size-4" />}
            <p className="text-xs uppercase tracking-wide">Net ({cardSuffix})</p>
          </div>
          <p className={cn("mt-2 font-mono font-semibold text-2xl tabular-nums", amountClass(last30.net))}>
            {formatBalance(last30.net, baseCurrency)}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {netDelta >= 0 ? "+" : "−"}
            {formatBalance(Math.abs(netDelta), baseCurrency)} vs {prevLabel}
          </p>
        </div>
      </div>

      {/* Trend charts */}
      <section className="rounded-lg border bg-card shadow-xs">
        <div className="flex @lg:flex-row flex-col @lg:items-center @lg:justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-medium text-sm">{chartTitle}</h2>
          <div className="flex @lg:inline-flex rounded-md border bg-muted/50 p-0.5">
            {CHART_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
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
        </div>
        <div className="p-4">
          {activeChart === "flow" &&
            (flowHasData ? (
              <ChartContainer config={flowConfig} className="aspect-auto h-64 w-full">
                <ComposedChart data={flowData} margin={{ left: 4, right: 12, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompact} />
                  <ChartTooltip content={<ChartTooltipContent reverse />} />
                  <ChartLegend content={<ChartLegendContent reverse />} />
                  {IMPORTANCE_TIERS.map((tier, index) => (
                    <Bar
                      key={tier}
                      dataKey={tier}
                      stackId="expense"
                      fill={`var(--color-${tier})`}
                      radius={index === IMPORTANCE_TIERS.length - 1 ? [4, 4, 0, 0] : 0}
                    />
                  ))}
                  <Bar dataKey="income" fill="var(--color-income)" radius={4} />
                </ComposedChart>
              </ChartContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                No income or expenses in this period.
              </div>
            ))}

          {activeChart === "networth" &&
            (accounts.length > 0 ? (
              <ChartContainer config={netWorthConfig} className="aspect-auto h-64 w-full">
                <AreaChart data={netWorthData} margin={{ left: 4, right: 12, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompact} />
                  <ChartTooltip content={<ChartTooltipContent />} />
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
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                Add an account to track net worth.
              </div>
            ))}

          {activeChart === "spending" &&
            (categoryData.length > 0 ? (
              <ChartContainer config={categoryConfig} className="aspect-auto h-64 w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                  <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={52}>
                    {categoryData.map((slice) => (
                      <Cell key={slice.name} fill={slice.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                No spending recorded in this period.
              </div>
            ))}
        </div>
      </section>

      <div className="grid @3xl:grid-cols-2 gap-4">
        {/* Recent transactions */}
        <section className="rounded-lg border bg-card shadow-xs">
          <div className="flex flex-col gap-2 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium text-sm">Recent activity</h2>
              <Button asChild size="sm" variant="ghost">
                <Link to="/transactions">View all</Link>
              </Button>
            </div>
            {/* Create actions — desktop only; mobile uses the FAB + command palette */}
            <div className="hidden items-center gap-1.5 md:flex">
              <Button onClick={createExpense} size="sm" className="flex-1">
                <ArrowDownLeftIcon className="size-4" />
                Expense
              </Button>
              <Button onClick={createIncome} size="sm" variant="outline" className="flex-1">
                <ArrowUpRightIcon className="size-4" />
                Income
              </Button>
              <Button onClick={createTransfer} size="sm" variant="outline" className="flex-1">
                <ArrowLeftRightIcon className="size-4" />
                Transfer
              </Button>
            </div>
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground text-sm">No transactions yet.</div>
          ) : (
            <div className="divide-y">
              {recent.map((transaction) => {
                const type = transaction.type as TransactionType;
                const Icon = TYPE_ICON[type] ?? ArrowDownLeftIcon;
                const account = accountMap.get(transaction.accountId);
                const display = getDisplayAmountForAccount(transaction);
                const title = transaction.title || type[0].toUpperCase() + type.slice(1);
                return (
                  <button
                    key={transaction.id}
                    type="button"
                    onClick={() => openEdit(transaction.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className={cn("shrink-0", TYPE_ACCENT[type] ?? TYPE_ACCENT.expense)}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{title}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {account?.labelText || "Untitled"} · {formatDateTimeDisplay(transaction.effectiveAt)}
                      </p>
                    </div>
                    <p
                      className={cn("shrink-0 font-medium font-mono text-sm tabular-nums", amountClass(display.amount))}
                    >
                      {formatBalance(display.amount, display.currency)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Accounts */}
        <section className="rounded-lg border bg-card shadow-xs">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-medium text-sm">Accounts</h2>
            <Button asChild size="sm" variant="ghost">
              <Link to="/accounts">Manage</Link>
            </Button>
          </div>
          {allAccounts.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">No accounts yet.</div>
          ) : (
            <div className="divide-y">
              {allAccounts.map((account) => {
                const converted = toBase(Number(account.balance), account.currency);
                const excluded = account.excludeFromDashboard;
                return (
                  <div
                    key={account.id}
                    className={cn(
                      "group flex items-center transition-colors hover:bg-muted/40",
                      excluded && "opacity-50",
                    )}
                  >
                    <Link
                      to="/transactions"
                      search={{ accountId: account.id }}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: account.labelColor }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{account.labelText || "Untitled"}</span>
                    </Link>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={excluded ? "Show on dashboard" : "Hide from dashboard"}
                          className="mx-1 shrink-0 rounded-md p-1.5 text-muted-foreground/60 opacity-0 transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() =>
                            db.db.executeKysely((q) =>
                              q
                                .updateTable("account")
                                .set({ excludeFromDashboard: !excluded })
                                .where("id", "=", account.id),
                            )
                          }
                        >
                          {excluded ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{excluded ? "Show on dashboard" : "Hide from dashboard"}</TooltipContent>
                    </Tooltip>
                    <Link
                      to="/transactions"
                      search={{ accountId: account.id }}
                      className="shrink-0 py-2.5 pr-4 text-right"
                    >
                      <span className="block font-medium font-mono text-sm tabular-nums">
                        {formatBalance(Number(account.balance), account.currency)}
                      </span>
                      {converted !== null && account.currency !== baseCurrency ? (
                        <span className="block font-mono text-muted-foreground text-xs tabular-nums">
                          ≈ {formatBalance(converted, baseCurrency)}
                        </span>
                      ) : null}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
