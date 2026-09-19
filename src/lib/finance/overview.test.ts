import { describe, expect, it } from "vitest";
import type { CurrencyRateItem } from "@/user-db/migrations";
import {
  type AmountConverter,
  buildCashFlowSeries,
  buildDailyBuckets,
  buildDailySpendingSeries,
  buildTrendBuckets,
  createAmountConverter,
  type DailySpendingRow,
  type LedgerRow,
  sumFlowTotals,
  sumNetWorth,
  type TrendBucket,
  topCategories,
  trailingDailyRange,
} from "./overview";

const identity: AmountConverter = (amount) => amount;

/** USD base with EUR at 0.5, so 10 EUR is 20 USD. UAH is missing on purpose. */
const rateRow = {
  id: "2026-08-01-USD",
  date: "2026-08-01",
  baseCurrency: "USD",
  USD: 1,
  EUR: 0.5,
} as unknown as CurrencyRateItem;

function dailyRow(partial: Partial<DailySpendingRow> & Pick<DailySpendingRow, "effectiveAt">): DailySpendingRow {
  return {
    accountId: partial.accountId ?? "a1",
    accountCurrency: partial.accountCurrency ?? "USD",
    amount: partial.amount ?? -10,
    category: partial.category ?? "Food",
    ...partial,
  };
}

function ledgerRow(partial: Partial<LedgerRow> & Pick<LedgerRow, "effectiveAt">): LedgerRow {
  return {
    type: partial.type ?? "expense",
    accountId: partial.accountId ?? "a1",
    accountCurrency: partial.accountCurrency ?? "USD",
    amount: partial.amount ?? -10,
    importance: partial.importance ?? null,
    ...partial,
  };
}

function bucket(label: string, start: number, end: number): TrendBucket {
  return { label, start, end };
}

describe("createAmountConverter", () => {
  it("passes the base currency through untouched", () => {
    const convert = createAmountConverter(rateRow, "USD");
    expect(convert(12.34, "USD")).toBe(12.34);
  });

  it("cross-converts through the rate row", () => {
    const convert = createAmountConverter(rateRow, "USD");
    expect(convert(10, "EUR")).toBe(20);
  });

  it("returns null for currencies the row doesn't cover", () => {
    const convert = createAmountConverter(rateRow, "USD");
    expect(convert(10, "UAH")).toBeNull();
  });

  it("returns null for foreign currencies when no rates are stored", () => {
    const convert = createAmountConverter(undefined, "USD");
    expect(convert(10, "EUR")).toBeNull();
    expect(convert(10, "USD")).toBe(10);
  });
});

describe("sumNetWorth", () => {
  const convert = createAmountConverter(rateRow, "USD");

  it("converts balances and groups them by currency", () => {
    const result = sumNetWorth(
      [
        { id: "a1", balance: 100, currency: "USD" },
        { id: "a2", balance: 10, currency: "EUR" },
        { id: "a3", balance: 5, currency: "EUR" },
      ],
      convert,
    );

    expect(result.netWorth).toBe(130);
    expect(result.unconvertibleAccounts).toBe(0);
    expect(result.balancesByCurrency.get("EUR")).toBe(15);
  });

  it("counts unconvertible accounts instead of pretending they are zero", () => {
    const result = sumNetWorth(
      [
        { id: "a1", balance: 100, currency: "USD" },
        { id: "a2", balance: 900, currency: "UAH" },
      ],
      convert,
    );

    expect(result.netWorth).toBe(100);
    expect(result.unconvertibleAccounts).toBe(1);
    expect(result.balancesByCurrency.get("UAH")).toBe(900);
  });
});

describe("sumFlowTotals", () => {
  it("reports expenses as positive magnitudes and nets them off", () => {
    const totals = sumFlowTotals(
      [
        { type: "income", accountCurrency: "USD", total: 500 },
        { type: "expense", accountCurrency: "USD", total: -120 },
        { type: "transfer", accountCurrency: "USD", total: -1000 },
      ],
      identity,
    );

    expect(totals).toEqual({ income: 500, expense: 120, net: 380 });
  });

  it("skips rows that cannot be converted", () => {
    const totals = sumFlowTotals(
      [
        { type: "income", accountCurrency: "USD", total: 500 },
        { type: "income", accountCurrency: "UAH", total: 9000 },
      ],
      createAmountConverter(rateRow, "USD"),
    );

    expect(totals.income).toBe(500);
  });
});

describe("topCategories", () => {
  it("merges currencies per category, sorts by size and truncates", () => {
    const categories = topCategories(
      [
        { category: "Food", accountCurrency: "USD", total: -30 },
        { category: "Food", accountCurrency: "EUR", total: -10 },
        { category: "Rent", accountCurrency: "USD", total: -100 },
        { category: "", accountCurrency: "USD", total: -5 },
      ],
      createAmountConverter(rateRow, "USD"),
      2,
    );

    expect(categories).toEqual([
      { name: "Rent", value: 100 },
      { name: "Food", value: 50 },
    ]);
  });

  it("labels blank categories", () => {
    const categories = topCategories([{ category: "", accountCurrency: "USD", total: -5 }], identity, 5);
    expect(categories[0]).toEqual({ name: "Uncategorized", value: 5 });
  });
});

describe("buildCashFlowSeries", () => {
  const buckets = [bucket("Jan", 0, 99), bucket("Feb", 100, 199)];

  it("splits income and expenses per bucket", () => {
    const series = buildCashFlowSeries({
      rows: [
        ledgerRow({ effectiveAt: 10, type: "income", amount: 200 }),
        ledgerRow({ effectiveAt: 20, amount: -50, importance: "fixed" }),
        ledgerRow({ effectiveAt: 150, amount: -20, importance: "investment" }),
      ],
      buckets,
      convert: identity,
      excludedAccountIds: new Set(),
    });

    expect(series[0]).toMatchObject({ label: "Jan", income: 200, expense: 50, net: 150, fixed: 50 });
    expect(series[1]).toMatchObject({ label: "Feb", income: 0, expense: 20, net: -20, investment: 20 });
  });

  it("files unclassified expenses under optional so tiers sum to the total", () => {
    const [point] = buildCashFlowSeries({
      rows: [ledgerRow({ effectiveAt: 10, amount: -40, importance: null })],
      buckets: [buckets[0]],
      convert: identity,
      excludedAccountIds: new Set(),
    });

    expect(point.optional).toBe(40);
    expect(point.fixed + point.flexible + point.optional + point.investment).toBe(point.expense);
  });

  it("ignores excluded accounts and rows outside every bucket", () => {
    const series = buildCashFlowSeries({
      rows: [
        ledgerRow({ effectiveAt: 10, amount: -40, accountId: "hidden" }),
        ledgerRow({ effectiveAt: 500, amount: -40 }),
        ledgerRow({ effectiveAt: 10, amount: -10 }),
      ],
      buckets,
      convert: identity,
      excludedAccountIds: new Set(["hidden"]),
    });

    expect(series[0].expense).toBe(10);
    expect(series[1].expense).toBe(0);
  });

  it("converts foreign-currency rows and skips unconvertible ones", () => {
    const [point] = buildCashFlowSeries({
      rows: [
        ledgerRow({ effectiveAt: 10, amount: -10, accountCurrency: "EUR" }),
        ledgerRow({ effectiveAt: 10, amount: -900, accountCurrency: "UAH" }),
      ],
      buckets: [buckets[0]],
      convert: createAmountConverter(rateRow, "USD"),
      excludedAccountIds: new Set(),
    });

    expect(point.expense).toBe(20);
  });
});

describe("trailingDailyRange", () => {
  it("covers count inclusive days ending today", () => {
    const now = new Date(2026, 7, 4, 12, 0, 0);
    const range = trailingDailyRange(7, now);

    expect(range.start).toBe(new Date(2026, 6, 29).getTime());
    expect(range.end).toBe(new Date(2026, 7, 4, 23, 59, 59, 999).getTime());
  });
});

describe("buildDailyBuckets", () => {
  it("emits one bucket per calendar day and marks month boundaries", () => {
    const start = new Date(2026, 6, 30, 8, 0, 0).getTime();
    const end = new Date(2026, 7, 2, 18, 0, 0).getTime();
    const buckets = buildDailyBuckets(start, end);

    expect(buckets.map((b) => b.label)).toEqual(["Jul 30", "31", "Aug 1", "2"]);
    expect(buckets[0].start).toBe(new Date(2026, 6, 30).getTime());
    expect(buckets.at(-1)?.end).toBe(new Date(2026, 7, 2, 23, 59, 59, 999).getTime());
  });
});

describe("buildDailySpendingSeries", () => {
  const start = new Date(2026, 7, 1).getTime();
  const end = new Date(2026, 7, 3, 23, 59, 59, 999).getTime();
  const buckets = buildDailyBuckets(start, end);

  it("totals each day and keeps the top categories", () => {
    const series = buildDailySpendingSeries({
      rows: [
        dailyRow({ effectiveAt: start + 1, amount: -40, category: "Rent" }),
        dailyRow({ effectiveAt: start + 2, amount: -10, category: "Food" }),
        dailyRow({ effectiveAt: start + 3, amount: -8, category: "Coffee" }),
        dailyRow({ effectiveAt: start + 4, amount: -6, category: "Taxi" }),
        dailyRow({ effectiveAt: start + 5, amount: -4, category: "Snacks" }),
        dailyRow({ effectiveAt: start + 6, amount: -2, category: "Tips" }),
        dailyRow({ effectiveAt: start + 86_400_000, amount: -15, category: "Food" }),
      ],
      buckets,
      convert: identity,
      excludedAccountIds: new Set(),
      categoryLimit: 5,
    });

    expect(series).toHaveLength(3);
    expect(series[0].total).toBe(70);
    expect(series[0].categories.map((c) => c.name)).toEqual(["Rent", "Food", "Coffee", "Taxi", "Snacks"]);
    expect(series[1]).toMatchObject({ total: 15, categories: [{ name: "Food", value: 15 }] });
    expect(series[2].total).toBe(0);
    expect(series[2].categories).toEqual([]);
  });

  it("merges blank categories, converts currency, and skips excluded or unconvertible rows", () => {
    const [point] = buildDailySpendingSeries({
      rows: [
        dailyRow({ effectiveAt: start + 1, amount: -10, category: "", accountCurrency: "EUR" }),
        dailyRow({ effectiveAt: start + 2, amount: -900, category: "Rent", accountCurrency: "UAH" }),
        dailyRow({ effectiveAt: start + 3, amount: -20, category: "Food", accountId: "hidden" }),
      ],
      buckets: [buckets[0]],
      convert: createAmountConverter(rateRow, "USD"),
      excludedAccountIds: new Set(["hidden"]),
    });

    expect(point.total).toBe(20);
    expect(point.categories).toEqual([{ name: "Uncategorized", value: 20 }]);
  });
});

describe("buildTrendBuckets", () => {
  const now = new Date(2026, 7, 4, 12, 0, 0);

  it("builds trailing calendar months in days mode", () => {
    const buckets = buildTrendBuckets({ mode: "days", cycleDay: 25, count: 3, now });

    expect(buckets.map((b) => b.label)).toEqual(["Jun", "Jul", "Aug"]);
    expect(new Date(buckets[0].start).getMonth()).toBe(5);
    expect(buckets[2].end).toBe(new Date(2026, 7, 31, 23, 59, 59, 999).getTime());
  });

  it("builds contiguous cycles ending today in cycle mode", () => {
    const buckets = buildTrendBuckets({ mode: "cycle", cycleDay: 25, count: 3, now });

    expect(buckets.map((b) => b.label)).toEqual(["May 25", "Jun 25", "Jul 25"]);
    // The open cycle ends at today, not at the cycle day.
    expect(buckets.at(-1)?.end).toBe(new Date(2026, 7, 4, 23, 59, 59, 999).getTime());
    // Each bucket ends the day before the next one starts — no gaps, no overlap.
    expect(buckets[1].start).toBe(new Date(2026, 5, 25).getTime());
    expect(buckets[0].end).toBe(new Date(2026, 5, 24, 23, 59, 59, 999).getTime());
  });
});
