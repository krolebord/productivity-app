import { format } from "date-fns";
import { parseDateKey } from "../agenda";
import { formatBalance, formatCompactBalance } from "../currency/format";
import { accountsQuery } from "../data/accounts";
import { latestCurrencyRateQuery } from "../data/currency-rates";
import { dashboardSettingsQuery, normalizeDashboardSettings } from "../data/dashboard-settings";
import { expenseCategoryTotalsQuery, flowTotalsByCurrencyQuery } from "../data/transactions";
import { type NetWorthPoint, netWorthQuery } from "../finance/net-worth";
import {
  type AccountBalance,
  type AmountConverter,
  createAmountConverter,
  type GroupedCategoryRow,
  type GroupedFlowRow,
  sumFlowTotals,
  sumNetWorth,
  topCategories,
} from "../finance/overview";
import { todayDateKeyInZone, zonedMidnightMs } from "../time-zone";
import type { CurrencyRateItem } from "../user-db/migrations";
import { readRows, type WidgetDbReader } from "./reader";
import { type FinancesWidgetSnapshot, WIDGET_PATHS, WIDGET_SNAPSHOT_VERSION, type WidgetContext } from "./snapshots";

const TOP_CATEGORIES = 3;

export type FinancesWidgetInputs = {
  baseCurrency: string;
  latestRate: CurrencyRateItem | undefined;
  accounts: (AccountBalance & { excludeFromDashboard: boolean })[];
  flowRows: GroupedFlowRow[];
  categoryRows: GroupedCategoryRow[];
  /** Net worth at the start of the month and now, from the net worth series query. */
  netWorthStart: number | null;
  netWorthNow: number | null;
};

/** This calendar month in the user's zone: [start, end]. */
export function widgetMonthRange(now: number, timeZone: string) {
  const todayKey = todayDateKeyInZone(timeZone, new Date(now));
  const [year, month] = todayKey.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = zonedMidnightMs(`${todayKey.slice(0, 7)}-01`, timeZone);
  const nextStart = zonedMidnightMs(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, timeZone);
  return { start, end: nextStart - 1, firstDayKey: `${todayKey.slice(0, 7)}-01` };
}

export function readFinancesWidgetInputs(db: WidgetDbReader, { now, timeZone }: WidgetContext): FinancesWidgetInputs {
  const { baseCurrency } = normalizeDashboardSettings(readRows(db, dashboardSettingsQuery)[0]);
  const [latestRate] = readRows(db, latestCurrencyRateQuery);
  const accounts = readRows(db, accountsQuery).map((account) => ({
    id: account.id,
    balance: account.balance,
    currency: account.currency,
    excludeFromDashboard: Boolean(account.excludeFromDashboard),
  }));
  const excludedAccountIds = accounts.filter((account) => account.excludeFromDashboard).map((account) => account.id);
  const month = widgetMonthRange(now, timeZone);
  const range = { start: month.start, end: month.end, excludedAccountIds };

  // The series query values each point with the rate of its day, like the Net worth chart.
  const series = netWorthQuery({
    buckets: [
      { label: "start", start: month.start, end: month.start - 1 },
      { label: "now", start: month.start, end: month.end },
    ],
    baseCurrency,
  });
  const [start, current] = db.execute<NetWorthPoint>(series).rows;

  return {
    baseCurrency,
    latestRate,
    accounts,
    flowRows: readRows(db, flowTotalsByCurrencyQuery(range)),
    categoryRows: readRows(db, expenseCategoryTotalsQuery(range)),
    netWorthStart: start?.netWorth ?? null,
    netWorthNow: current?.netWorth ?? null,
  };
}

function countUnconverted(
  rows: readonly { accountCurrency: string; total: number | null }[],
  convert: AmountConverter,
) {
  return rows.filter((row) => convert(Number(row.total ?? 0), row.accountCurrency) === null).length;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function buildFinancesWidgetSnapshot(inputs: FinancesWidgetInputs, ctx: WidgetContext): FinancesWidgetSnapshot {
  const { baseCurrency: currency } = inputs;
  // The same converter and sums as the Finances tab, so the widget never disagrees with it.
  const convert = createAmountConverter(inputs.latestRate, currency);
  const included = inputs.accounts.filter((account) => !account.excludeFromDashboard);
  const { netWorth, unconvertibleAccounts } = sumNetWorth(included, convert);
  const flow = sumFlowTotals(inputs.flowRows, convert);
  const categories = topCategories(inputs.categoryRows, convert, TOP_CATEGORIES);
  const unconvertedFlows = countUnconverted(inputs.flowRows, convert);

  const change =
    inputs.netWorthStart != null && inputs.netWorthNow != null ? inputs.netWorthNow - inputs.netWorthStart : null;
  // Below a cent reads as no change, and a "+$0.00" with an arrow would look like news.
  const direction = change == null || Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down";
  const signed = (text: string) => (direction === "up" ? `+${text}` : text);

  const notices = [
    unconvertibleAccounts > 0 ? `${plural(unconvertibleAccounts, "account")} not converted` : null,
    unconvertedFlows > 0 ? "some transactions not converted" : null,
  ].filter((notice) => notice != null);

  return {
    v: WIDGET_SNAPSHOT_VERSION,
    kind: "finances",
    state: inputs.accounts.length === 0 && inputs.flowRows.length === 0 ? "empty" : "ok",
    writtenAt: ctx.now,
    links: { open: ctx.link(WIDGET_PATHS.open), finances: ctx.link(WIDGET_PATHS.finances) },
    currency,
    netWorth: formatBalance(netWorth, currency),
    netWorthCompact: formatCompactBalance(netWorth, currency),
    change:
      change == null
        ? null
        : {
            amount: signed(formatBalance(change, currency)),
            compact: signed(formatCompactBalance(change, currency)),
            direction,
          },
    monthLabel: format(parseDateKey(widgetMonthRange(ctx.now, ctx.timeZone).firstDayKey), "MMMM"),
    income: formatBalance(flow.income, currency),
    expense: formatBalance(flow.expense, currency),
    categories: categories.map((category) => ({
      name: category.name,
      amount: formatBalance(category.value, currency),
      share: flow.expense > 0 ? Math.min(1, category.value / flow.expense) : 0,
    })),
    notice: notices.length > 0 ? notices.join(" · ") : null,
  };
}
