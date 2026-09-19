import { createMigrator, createStoredValue, SQLiteReactiveDb } from "@sqlite-sync/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_CURRENCIES, type AppCurrencyCode } from "@/lib/currency/currencies";
import { syncDbSchema, type TransactionEntryItem } from "@/user-db/migrations";
import { type NetWorthPoint, netWorthQuery } from "./net-worth";
import type { TrendBucket } from "./overview";

let reactiveDb: SQLiteReactiveDb<unknown>;
let now: number;

function bucket(day: number): TrendBucket {
  return {
    label: `Sep ${day}`,
    start: new Date(2026, 8, day).getTime(),
    end: new Date(2026, 8, day, 23, 59, 59, 999).getTime(),
  };
}

function account({
  id = "a1",
  balance,
  currency = "USD",
  excluded = false,
}: {
  id?: string;
  balance: number;
  currency?: string;
  excluded?: boolean;
}) {
  reactiveDb.db.sql`
    insert into _account (id, currency, balance, createdAt, excludeFromDashboard)
    values (${id}, ${currency}, ${balance}, ${now}, ${Number(excluded)})
  `;
}

function transaction(row: Pick<TransactionEntryItem, "id" | "amount" | "effectiveAt"> & Partial<TransactionEntryItem>) {
  reactiveDb.db.sql`
    insert into _transaction_entry (
      id, accountId, accountCurrency, amount, effectiveAt, createdAt, updatedAt,
      counterpartyAccountId, counterpartyCurrency, counterpartyAmount, type
    ) values (
      ${row.id}, ${row.accountId ?? "a1"}, ${row.accountCurrency ?? "USD"}, ${row.amount},
      ${row.effectiveAt}, ${now}, ${now}, ${row.counterpartyAccountId ?? ""},
      ${row.counterpartyCurrency ?? ""}, ${row.counterpartyAmount ?? null}, ${row.type ?? "expense"}
    )
  `;
}

function rate({
  date,
  base = "USD",
  rates,
}: {
  date: string;
  base?: string;
  rates: Partial<Record<AppCurrencyCode, number | null>>;
}) {
  reactiveDb.db.execute({
    sql: `insert into _currency_rate (id, date, baseCurrency, ${APP_CURRENCIES.map((c) => `"${c}"`).join(",")})
      values (?, ?, ?, ${APP_CURRENCIES.map(() => "?").join(",")})`,
    parameters: [`${date}-${base}`, date, base, ...APP_CURRENCIES.map((c) => rates[c] ?? null)],
  });
}

function series(buckets = [bucket(3), bucket(19)], baseCurrency = "USD") {
  return reactiveDb.db.execute<NetWorthPoint>(netWorthQuery({ buckets, baseCurrency })).rows;
}

beforeEach(async () => {
  now = new Date(2026, 8, 19, 12).getTime();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  reactiveDb = await SQLiteReactiveDb.create({ snapshot: new Uint8Array(), logger: () => {} });
  createMigrator({
    migrations: syncDbSchema.migrations,
    schemaVersion: createStoredValue({ initialValue: -1 }),
  }).migrateDbToLatest({
    startTransaction: (callback) => {
      reactiveDb.db.executeTransaction((tx) =>
        callback({ execute: (sql, parameters) => tx.execute({ sql, parameters }) }),
      );
    },
  });
  for (const table of ["account", "transaction_entry", "currency_rate"]) {
    reactiveDb.db.execute(`create view "${table}" as select * from "_${table}" where tombstone = 0`);
  }
  reactiveDb.db.createScalarFunction({ name: "unixepoch", callback: (_modifier: string) => now / 1000 });
});

afterEach(() => {
  reactiveDb.dispose();
  vi.useRealTimers();
});

describe("netWorthQuery", () => {
  it("carries unchanged balances backward regardless of when the account was added", () => {
    account({ balance: 5000 });
    expect(series()).toEqual([
      { label: "Sep 3", netWorth: 5000, missingCurrencies: 0, estimatedCurrencies: 0 },
      { label: "Sep 19", netWorth: 5000, missingCurrencies: 0, estimatedCurrencies: 0 },
    ]);
  });

  it("rewinds signed income, expenses, adjustments and future entries, with inclusive cutoffs", () => {
    account({ balance: 1260 });
    transaction({ id: "boundary", amount: 100, effectiveAt: bucket(3).end, type: "income" });
    transaction({ id: "income", amount: 50, effectiveAt: bucket(4).start, type: "income" });
    transaction({ id: "expense", amount: -20, effectiveAt: bucket(5).start });
    transaction({ id: "adjustment", amount: 30, effectiveAt: bucket(6).start, type: "adjustment" });
    transaction({ id: "future", amount: 200, effectiveAt: now + 60_000, type: "income" });
    expect(series().map((point) => point.netWorth)).toEqual([1000, 1060]);
  });

  it("rewinds both transfer legs before converting the resulting balances", () => {
    account({ balance: 1000 });
    account({ id: "a2", balance: 50, currency: "EUR" });
    transaction({
      id: "transfer",
      type: "transfer",
      amount: -100,
      effectiveAt: bucket(5).start,
      counterpartyAccountId: "a2",
      counterpartyCurrency: "EUR",
      counterpartyAmount: 50,
    });
    rate({ date: "2026-09-03", rates: { EUR: 0.5 } });
    rate({ date: "2026-09-19", rates: { EUR: 0.25 } });
    expect(series().map((point) => point.netWorth)).toEqual([1100, 1200]);
  });

  it.each([
    { excluded: "a1", expected: [0, 100] },
    { excluded: "a2", expected: [1000, 900] },
  ])("excludes only the $excluded leg of a transfer", ({ excluded, expected }) => {
    account({ balance: 900, excluded: excluded === "a1" });
    account({ id: "a2", balance: 100, excluded: excluded === "a2" });
    transaction({
      id: "transfer",
      type: "transfer",
      amount: -100,
      effectiveAt: bucket(5).start,
      counterpartyAccountId: "a2",
      counterpartyCurrency: "USD",
      counterpartyAmount: 100,
    });
    expect(series().map((point) => point.netWorth)).toEqual(expected);
  });

  it("prefers exact rates, then the closest future date, then the latest earlier date", () => {
    account({ balance: 80, currency: "EUR" });
    rate({ date: "2026-09-02", rates: { EUR: 0.5 } });
    rate({ date: "2026-09-05", rates: { EUR: 0.8 } });
    rate({ date: "2026-09-08", rates: { EUR: 0.4 } });
    const points = series([2, 3, 4, 5, 6, 9, 19].map(bucket));
    expect(points.map((point) => point.netWorth)).toEqual([160, 100, 100, 100, 200, 200, 200]);
    expect(points.map((point) => point.estimatedCurrencies)).toEqual([0, 1, 1, 0, 1, 1, 1]);
  });

  it("requires both rates from the same row, skips unusable pairs, and cross-converts any base", () => {
    account({ balance: 80, currency: "EUR" });
    rate({ date: "2026-09-03", base: "GBP", rates: { EUR: 0.8 } });
    rate({ date: "2026-09-04", base: "GBP", rates: { USD: 2 } });
    rate({ date: "2026-09-05", base: "GBP", rates: { EUR: 0, USD: 2 } });
    rate({ date: "2026-09-06", base: "GBP", rates: { EUR: 0.8, USD: -1 } });
    rate({ date: "2026-09-07", base: "GBP", rates: { EUR: 0.8, USD: 2 } });
    expect(series()[0]).toMatchObject({ netWorth: 200, estimatedCurrencies: 1 });
    expect(series(undefined, "GBP")[0]).toMatchObject({ netWorth: 100, estimatedCurrencies: 0 });
  });

  it("returns gaps for missing conversions without hiding valid points", () => {
    account({ balance: 100 });
    account({ id: "foreign", balance: 50, currency: "EUR" });
    transaction({ id: "deposit", accountId: "foreign", accountCurrency: "EUR", amount: 50, effectiveAt: now });
    expect(series()).toEqual([
      { label: "Sep 3", netWorth: 100, missingCurrencies: 0, estimatedCurrencies: 0 },
      { label: "Sep 19", netWorth: null, missingCurrencies: 1, estimatedCurrencies: 0 },
    ]);
  });

  it("ignores deleted accounts, transactions and rates", () => {
    account({ balance: 80, currency: "EUR" });
    account({ id: "deleted", balance: 9999 });
    transaction({ id: "deleted", amount: -100, accountCurrency: "EUR", effectiveAt: now });
    rate({ date: "2026-09-03", rates: { EUR: 0.5 } });
    rate({ date: "2026-09-05", rates: { EUR: 0.8 } });
    reactiveDb.db.execute("update _account set tombstone = 1 where id = 'deleted'");
    reactiveDb.db.execute("update _transaction_entry set tombstone = 1 where id = 'deleted'");
    reactiveDb.db.execute("update _currency_rate set tombstone = 1 where date = '2026-09-03'");
    expect(series().map((point) => point.netWorth)).toEqual([100, 100]);
  });

  it("returns zero for no included accounts, and no rows for no buckets", () => {
    account({ balance: 80, currency: "EUR", excluded: true });
    expect(series().map((point) => point.netWorth)).toEqual([0, 0]);
    expect(series([])).toEqual([]);
  });

  it("updates the current cutoff when new transactions arrive without rebuilding the query", async () => {
    account({ balance: 1000 });
    const live = reactiveDb.createLiveQuery<NetWorthPoint>(
      netWorthQuery({ buckets: [bucket(3), bucket(19)], baseCurrency: "USD" }),
    );
    const listener = vi.fn();
    const unsubscribe = live.subscribe(listener);
    try {
      expect(live.getRows().at(-1)?.netWorth).toBe(1000);
      now += 60_000;
      reactiveDb.db.executeTransaction(() => {
        transaction({ id: "new", amount: -100, effectiveAt: now });
        reactiveDb.db.execute("update _account set balance = 900 where id = 'a1'");
      });
      await vi.waitFor(() => expect(live.getRows().at(-1)?.netWorth).toBe(900));
      expect(live.getRows()[0].netWorth).toBe(1000);
      expect(listener).toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
    listener.mockClear();
    reactiveDb.db.execute("update _account set balance = 800 where id = 'a1'");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(listener).not.toHaveBeenCalled();
  });

  it("refreshes when a future entry becomes effective and when a missing rate arrives", async () => {
    account({ balance: 80, currency: "EUR" });
    transaction({ id: "future", amount: 80, accountCurrency: "EUR", effectiveAt: now + 60_000 });
    const live = reactiveDb.createLiveQuery<NetWorthPoint>(
      netWorthQuery({ buckets: [bucket(19)], baseCurrency: "USD" }),
    );
    const unsubscribe = live.subscribe(() => {});
    try {
      expect(live.getRows()[0].netWorth).toBe(0);
      now += 60_000;
      live.refresh();
      expect(live.getRows()[0]).toMatchObject({ netWorth: null, missingCurrencies: 1 });
      rate({ date: "2026-09-19", rates: { EUR: 0.8 } });
      await vi.waitFor(() => expect(live.getRows()[0].netWorth).toBe(100));
    } finally {
      unsubscribe();
    }
  });
});
