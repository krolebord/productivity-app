import { formatBalance, formatCompactBalance } from "../currency/format";
import { resolveDashboardRange } from "../dashboard-range-store";
import { accountsQuery } from "../data/accounts";
import { latestCurrencyRateQuery } from "../data/currency-rates";
import { dashboardSettingsQuery, normalizeDashboardSettings } from "../data/dashboard-settings";
import { expenseCategoryTotalsQuery, flowTotalsByCurrencyQuery } from "../data/transactions";
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
  periodLabel: string;
};

export function readFinancesWidgetInputs(db: WidgetDbReader, { now, timeZone }: WidgetContext): FinancesWidgetInputs {
  const settings = normalizeDashboardSettings(readRows(db, dashboardSettingsQuery)[0]);
  const { baseCurrency } = settings;
  const [latestRate] = readRows(db, latestCurrencyRateQuery);
  const accounts = readRows(db, accountsQuery).map((account) => ({
    id: account.id,
    balance: account.balance,
    currency: account.currency,
    excludeFromDashboard: Boolean(account.excludeFromDashboard),
  }));
  const excludedAccountIds = accounts.filter((account) => account.excludeFromDashboard).map((account) => account.id);
  const selected = resolveDashboardRange(settings, new Date(now), timeZone);
  const range = { start: selected.rangeStart, end: selected.rangeEnd, excludedAccountIds };

  return {
    baseCurrency,
    latestRate,
    accounts,
    flowRows: readRows(db, flowTotalsByCurrencyQuery(range)),
    categoryRows: readRows(db, expenseCategoryTotalsQuery(range)),
    periodLabel: selected.label,
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

  const net = flow.income - flow.expense;
  const direction = Math.abs(net) < 0.005 ? "flat" : net > 0 ? "up" : "down";
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
    change: null,
    monthLabel: inputs.periodLabel,
    periodLabel: inputs.periodLabel,
    net: {
      amount: signed(formatBalance(net, currency)),
      compact: signed(formatCompactBalance(net, currency)),
      direction,
    },
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
