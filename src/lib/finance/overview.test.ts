import { describe, expect, it } from "vitest";
import type { CurrencyRateItem } from "@/user-db/migrations";
import {
  type AmountConverter,
  buildCashFlowSeries,
  buildNetWorthSeries,
  buildTrendBuckets,
  createAmountConverter,
  type LedgerRow,
  sumFlowTotals,
  sumNetWorth,
  type TrendBucket,
  topCategories,
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

function ledgerRow(partial: Partial<LedgerRow> & Pick<LedgerRow, "effectiveAt">): LedgerRow {
  return {
    type: partial.type ?? "expense",
    accountId: partial.accountId ?? "a1",
    accountCurrency: partial.accountCurrency ?? "USD",
    amount: partial.amount ?? -10,
    importance: partial.importance ?? null,
    counterpartyAccountId: partial.counterpartyAccountId ?? "",
    counterpartyCurrency: partial.counterpartyCurrency ?? "",
    counterpartyAmount: partial.counterpartyAmount ?? null,
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

describe("buildNetWorthSeries", () => {
  const buckets = [bucket("Jan", 0, 99), bucket("Feb", 100, 199)];
  const balances = new Map([["USD", 1000]]);

  it("rewinds later rows out of the current balance", () => {
    const series = buildNetWorthSeries({
      rows: [ledgerRow({ effectiveAt: 150, amount: -200 })],
      buckets,
      balancesByCurrency: balances,
      convert: identity,
      excludedAccountIds: new Set(),
      nowTs: 199,
    });

    // The January point predates the expense, so the money was still there.
    expect(series[0]).toEqual({ label: "Jan", netWorth: 1200 });
    // The last bucket is measured at `now`, which is after the expense.
    expect(series[1]).toEqual({ label: "Feb", netWorth: 1000 });
  });

  it("rewinds both legs of a transfer", () => {
    const series = buildNetWorthSeries({
      rows: [
        ledgerRow({
          effectiveAt: 150,
          type: "transfer",
          amount: -100,
          accountCurrency: "USD",
          counterpartyAccountId: "a2",
          counterpartyCurrency: "EUR",
          counterpartyAmount: 50,
        }),
      ],
      buckets,
      balancesByCurrency: new Map([
        ["USD", 1000],
        ["EUR", 50],
      ]),
      convert: createAmountConverter(rateRow, "USD"),
      excludedAccountIds: new Set(),
      nowTs: 199,
    });

    // Before the transfer the money sat in USD: 1100 USD and 0 EUR. Forgetting to
    // rewind the destination leg would leave the 50 EUR double-counted (1200).
    expect(series[0].netWorth).toBe(1100);
    // At `now` the transfer has happened: 1000 USD + 50 EUR.
    expect(series[1].netWorth).toBe(1100);
  });

  it("leaves excluded accounts out of the reconstruction", () => {
    const series = buildNetWorthSeries({
      rows: [ledgerRow({ effectiveAt: 150, amount: -200, accountId: "hidden" })],
      buckets,
      balancesByCurrency: balances,
      convert: identity,
      excludedAccountIds: new Set(["hidden"]),
      nowTs: 199,
    });

    expect(series[0].netWorth).toBe(1000);
  });

  it("skips currencies without a rate instead of counting them as zero", () => {
    const series = buildNetWorthSeries({
      rows: [],
      buckets: [buckets[0]],
      balancesByCurrency: new Map([
        ["USD", 100],
        ["UAH", 9000],
      ]),
      convert: createAmountConverter(rateRow, "USD"),
      excludedAccountIds: new Set(),
      nowTs: 99,
    });

    expect(series[0].netWorth).toBe(100);
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
