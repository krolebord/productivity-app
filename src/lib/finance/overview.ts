import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { convertAmount } from "@/lib/currency/convert";
import { cycleStartOnOrBefore, type DashboardRangeMode } from "@/lib/dashboard-range-store";
import { IMPORTANCE_TIERS, type ImportanceTier, type TransactionRow } from "@/lib/transactions";
import type { CurrencyRateItem } from "@/user-db/migrations";

/**
 * Pure derivations behind the finances overview. Everything here takes plain
 * rows and returns plain series so the maths (currency conversion, excluded
 * accounts, balance reconstruction) is testable without a database or a chart.
 */

export type TrendBucket = {
  label: string;
  start: number;
  end: number;
};

/**
 * Converts into the display currency, or returns null when no rate covers the
 * pair. Callers must skip null rather than treat it as 0, otherwise unconvertible
 * money would silently read as "nothing".
 */
export type AmountConverter = (amount: number, currency: string) => number | null;

export function createAmountConverter(rate: CurrencyRateItem | undefined, baseCurrency: string): AmountConverter {
  return (amount, currency) => {
    if (currency === baseCurrency) {
      return amount;
    }
    if (!rate) {
      return null;
    }
    return convertAmount(rate, amount, currency, baseCurrency);
  };
}

export type AccountBalance = {
  id: string;
  balance: number;
  currency: string;
};

export type LedgerRow = Pick<
  TransactionRow,
  | "accountCurrency"
  | "accountId"
  | "amount"
  | "counterpartyAccountId"
  | "counterpartyAmount"
  | "counterpartyCurrency"
  | "effectiveAt"
  | "importance"
  | "type"
>;

export type DailySpendingRow = Pick<
  TransactionRow,
  "accountCurrency" | "accountId" | "amount" | "category" | "effectiveAt"
>;

export type GroupedFlowRow = {
  type: string;
  accountCurrency: string;
  total: number | null;
};

export type GroupedCategoryRow = {
  category: string;
  accountCurrency: string;
  total: number | null;
};

export type FlowTotals = {
  income: number;
  expense: number;
  net: number;
};

export type CashFlowPoint = FlowTotals & { label: string } & Record<ImportanceTier, number>;

export type NetWorthPoint = {
  label: string;
  netWorth: number;
};

export type DailyCategoryShare = {
  name: string;
  value: number;
};

export type DailySpendingPoint = {
  /** Short tick on the axis — day-of-month, with the month on the first day and month boundaries. */
  label: string;
  dateLabel: string;
  total: number;
  categories: DailyCategoryShare[];
};

export function buildTrendBuckets({
  mode,
  cycleDay,
  count,
  now,
}: {
  mode: DashboardRangeMode;
  cycleDay: number;
  count: number;
  now: Date;
}): TrendBucket[] {
  if (mode === "cycle") {
    const starts = [cycleStartOnOrBefore(now, cycleDay)];
    while (starts.length < count) {
      starts.unshift(cycleStartOnOrBefore(subDays(starts[0], 1), cycleDay));
    }

    return starts.map((start, index) => {
      const nextStart = index === starts.length - 1 ? null : starts[index + 1];
      return {
        label: format(start, "MMM d"),
        start: startOfDay(start).getTime(),
        end: nextStart ? endOfDay(subDays(nextStart, 1)).getTime() : endOfDay(now).getTime(),
      };
    });
  }

  return Array.from({ length: count }, (_, index) => {
    const month = subMonths(now, count - 1 - index);
    return {
      label: format(month, "MMM"),
      start: startOfMonth(month).getTime(),
      end: endOfMonth(month).getTime(),
    };
  });
}

export function sumNetWorth(accounts: readonly AccountBalance[], convert: AmountConverter) {
  const balancesByCurrency = new Map<string, number>();
  let netWorth = 0;
  let unconvertibleAccounts = 0;

  for (const account of accounts) {
    const balance = Number(account.balance);
    balancesByCurrency.set(account.currency, (balancesByCurrency.get(account.currency) ?? 0) + balance);

    const converted = convert(balance, account.currency);
    if (converted === null) {
      unconvertibleAccounts += 1;
    } else {
      netWorth += converted;
    }
  }

  return { netWorth, unconvertibleAccounts, balancesByCurrency };
}

/** Totals from a `group by type, currency` query. Expenses come back positive. */
export function sumFlowTotals(rows: readonly GroupedFlowRow[], convert: AmountConverter): FlowTotals {
  let income = 0;
  let expense = 0;

  for (const row of rows) {
    const total = convert(Number(row.total ?? 0), row.accountCurrency);
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

/** Biggest spending categories from a `group by category, currency` query. */
export function topCategories(rows: readonly GroupedCategoryRow[], convert: AmountConverter, limit: number) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const total = convert(Number(row.total ?? 0), row.accountCurrency);
    if (total === null) {
      continue;
    }
    const name = row.category || "Uncategorized";
    totals.set(name, (totals.get(name) ?? 0) + Math.abs(total));
  }

  return Array.from(totals, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** One calendar day per bar for the selected dashboard window. */
export function buildDailyBuckets(rangeStart: number, rangeEnd: number): TrendBucket[] {
  return eachDayOfInterval({ start: new Date(rangeStart), end: new Date(rangeEnd) }).map((day, index) => ({
    label: format(day, index === 0 || day.getDate() === 1 ? "MMM d" : "d"),
    start: startOfDay(day).getTime(),
    end: endOfDay(day).getTime(),
  }));
}

export function buildDailySpendingSeries({
  rows,
  buckets,
  convert,
  excludedAccountIds,
  categoryLimit = 5,
}: {
  rows: readonly DailySpendingRow[];
  buckets: readonly TrendBucket[];
  convert: AmountConverter;
  excludedAccountIds: ReadonlySet<string>;
  categoryLimit?: number;
}): DailySpendingPoint[] {
  return buckets.map((bucket) => {
    const totals = new Map<string, number>();
    let total = 0;

    for (const row of rows) {
      if (row.effectiveAt < bucket.start || row.effectiveAt > bucket.end) {
        continue;
      }
      if (excludedAccountIds.has(row.accountId)) {
        continue;
      }
      const value = convert(Number(row.amount), row.accountCurrency);
      if (value === null) {
        continue;
      }
      const magnitude = Math.abs(value);
      total += magnitude;
      const name = row.category || "Uncategorized";
      totals.set(name, (totals.get(name) ?? 0) + magnitude);
    }

    const categories = Array.from(totals, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, categoryLimit);

    return {
      label: bucket.label,
      dateLabel: format(new Date(bucket.start), "EEE, MMM d"),
      total,
      categories,
    };
  });
}

function emptyTiers(): Record<ImportanceTier, number> {
  return { fixed: 0, flexible: 0, optional: 0, investment: 0 };
}

export function buildCashFlowSeries({
  rows,
  buckets,
  convert,
  excludedAccountIds,
}: {
  rows: readonly LedgerRow[];
  buckets: readonly TrendBucket[];
  convert: AmountConverter;
  excludedAccountIds: ReadonlySet<string>;
}): CashFlowPoint[] {
  return buckets.map((bucket) => {
    const tiers = emptyTiers();
    let income = 0;
    let expense = 0;

    for (const row of rows) {
      if (row.effectiveAt < bucket.start || row.effectiveAt > bucket.end) {
        continue;
      }
      if (excludedAccountIds.has(row.accountId)) {
        continue;
      }
      const value = convert(Number(row.amount), row.accountCurrency);
      if (value === null) {
        continue;
      }

      if (row.type === "income") {
        income += value;
      } else if (row.type === "expense") {
        const magnitude = Math.abs(value);
        expense += magnitude;
        // Unclassified expenses land in "optional" so the stack still sums to the total.
        tiers[isImportanceTier(row.importance) ? row.importance : "optional"] += magnitude;
      }
    }

    return { label: bucket.label, income, expense, net: income - expense, ...tiers };
  });
}

function isImportanceTier(value: string | null): value is ImportanceTier {
  return value !== null && (IMPORTANCE_TIERS as readonly string[]).includes(value);
}

/**
 * Reconstructs past net worth by rewinding today's balances through every later
 * ledger row. Both legs of a transfer are rewound, and excluded accounts are left
 * out of the reconstruction as well as the starting balances.
 */
export function buildNetWorthSeries({
  rows,
  buckets,
  balancesByCurrency,
  convert,
  excludedAccountIds,
  nowTs,
}: {
  rows: readonly LedgerRow[];
  buckets: readonly TrendBucket[];
  balancesByCurrency: ReadonlyMap<string, number>;
  convert: AmountConverter;
  excludedAccountIds: ReadonlySet<string>;
  nowTs: number;
}): NetWorthPoint[] {
  return buckets.map((bucket, index) => {
    const boundary = index === buckets.length - 1 ? nowTs : bucket.end;
    const deltaByCurrency = new Map<string, number>();

    for (const row of rows) {
      if (row.effectiveAt <= boundary) {
        continue;
      }
      if (!excludedAccountIds.has(row.accountId)) {
        deltaByCurrency.set(row.accountCurrency, (deltaByCurrency.get(row.accountCurrency) ?? 0) + Number(row.amount));
      }
      if (
        row.counterpartyCurrency &&
        row.counterpartyAmount !== null &&
        !excludedAccountIds.has(row.counterpartyAccountId)
      ) {
        deltaByCurrency.set(
          row.counterpartyCurrency,
          (deltaByCurrency.get(row.counterpartyCurrency) ?? 0) + Number(row.counterpartyAmount),
        );
      }
    }

    let netWorth = 0;
    for (const currency of new Set([...balancesByCurrency.keys(), ...deltaByCurrency.keys()])) {
      const balance = (balancesByCurrency.get(currency) ?? 0) - (deltaByCurrency.get(currency) ?? 0);
      const value = convert(balance, currency);
      if (value !== null) {
        netWorth += value;
      }
    }

    return { label: bucket.label, netWorth };
  });
}
