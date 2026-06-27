import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRightLeftIcon, CoinsIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrencyOptions, getRate } from "@/lib/currency/convert";
import { APP_CURRENCIES, type AppCurrencyCode } from "@/lib/currency/currencies";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc/orpc-client";
import { useDb, useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/currencies")({
  component: CurrenciesPage,
});

type RefreshRatesResult = {
  date: string;
  base: string;
  rates: Partial<Record<AppCurrencyCode, number>>;
};

function formatNumber(value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${formatNumber(value, 2)}`;
  }
}

function persistCurrencyRates(db: ReturnType<typeof useDb>["db"], data: RefreshRatesResult) {
  const id = `${data.date}-${data.base}`;
  const rateValues = Object.fromEntries(
    APP_CURRENCIES.map((currency) => [currency, data.rates[currency] ?? (currency === data.base ? 1 : null)]),
  ) as Record<AppCurrencyCode, number | null>;

  db.executeTransaction((trx) => {
    const [existing] = trx.executeKysely((q) => q.selectFrom("currency_rate").select("id").where("id", "=", id)).rows;

    if (existing) {
      trx.executeKysely((q) =>
        q
          .updateTable("currency_rate")
          .set({
            date: data.date,
            baseCurrency: data.base,
            ...rateValues,
          })
          .where("id", "=", id),
      );
      return;
    }

    trx.executeKysely((q) =>
      q.insertInto("currency_rate").values({
        id,
        date: data.date,
        baseCurrency: data.base,
        tombstone: false,
        ...rateValues,
      }),
    );
  });
}

function CurrenciesPage() {
  const db = useDb();
  const [amount, setAmount] = useState("100");
  const [fromCurrency, setFromCurrency] = useState<AppCurrencyCode>("USD");
  const [toCurrency, setToCurrency] = useState<AppCurrencyCode>("EUR");

  const { data: rates } = useDbQuery((db) =>
    db.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc"),
  );
  const latestRate = rates[0];

  const refreshMutation = useMutation(
    orpc.currency.refresh.mutationOptions({
      onSuccess: (data) => {
        persistCurrencyRates(db.db, data);
        toast.success("Currency rates refreshed.", {
          description: `Stored rates for ${data.date}.`,
        });
      },
      onError: (error) => {
        toast.error("Could not refresh currency rates.", {
          description: error instanceof Error ? error.message : "Unknown error.",
        });
      },
    }),
  );

  const currencyOptions = useMemo(() => (latestRate ? getCurrencyOptions(latestRate) : []), [latestRate]);
  const ratesForDisplay = useMemo(
    () =>
      latestRate
        ? APP_CURRENCIES.map((currency) => ({ currency, rate: getRate(latestRate, currency) })).filter(
            (entry): entry is { currency: AppCurrencyCode; rate: number } => entry.rate !== null,
          )
        : [],
    [latestRate],
  );

  const numericAmount = Number(amount);
  const fromRate = latestRate ? getRate(latestRate, fromCurrency) : null;
  const toRate = latestRate ? getRate(latestRate, toCurrency) : null;
  const convertedAmount =
    Number.isFinite(numericAmount) && fromRate !== null && toRate !== null ? (numericAmount / fromRate) * toRate : null;

  function refreshRates() {
    refreshMutation.mutate({ baseCurrency: "USD" });
  }

  if (!latestRate) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <Button onClick={refreshRates} disabled={refreshMutation.isPending} size="lg">
          <RefreshCwIcon className={refreshMutation.isPending ? "animate-spin" : undefined} />
          Refresh currencies
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-semibold text-xl">Currencies</h1>
          <p className="text-muted-foreground text-sm">
            Latest stored rates for {latestRate.date}, based on {latestRate.baseCurrency}.
          </p>
        </div>
        <Button onClick={refreshRates} size="sm" variant="outline" disabled={refreshMutation.isPending}>
          <RefreshCwIcon className={refreshMutation.isPending ? "animate-spin" : undefined} />
          Refresh currencies
        </Button>
      </div>

      <div className="grid gap-4">
        <section className="rounded-md border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <ArrowRightLeftIcon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Converter</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)_minmax(260px,1fr)] lg:items-end">
            <div className="grid gap-2 lg:max-w-sm">
              <Label htmlFor="currency-amount">Amount</Label>
              <Input
                id="currency-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="grid gap-2">
                <Label htmlFor="currency-from">From</Label>
                <CurrencySelect
                  id="currency-from"
                  value={fromCurrency}
                  currencies={currencyOptions}
                  onChange={setFromCurrency}
                />
              </div>
              <ArrowRightLeftIcon className="mb-2 size-4 text-muted-foreground" />
              <div className="grid gap-2">
                <Label htmlFor="currency-to">To</Label>
                <CurrencySelect
                  id="currency-to"
                  value={toCurrency}
                  currencies={currencyOptions}
                  onChange={setToCurrency}
                />
              </div>
            </div>

            <div className="rounded-md border bg-background px-3 py-3">
              <p className="text-muted-foreground text-xs">Converted amount</p>
              <p
                className={cn(
                  "mt-1 font-mono font-semibold text-2xl",
                  convertedAmount === null && "text-muted-foreground",
                )}
              >
                {convertedAmount === null ? "—" : formatCurrency(convertedAmount, toCurrency)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-md border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <CoinsIcon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Fetched Currencies</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {ratesForDisplay.map(({ currency, rate }) => (
              <div
                key={currency}
                className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:odd:border-r xl:[&:not(:nth-child(3n))]:border-r"
              >
                <div>
                  <p className="font-medium text-sm">{currency}</p>
                  <p className="text-muted-foreground text-xs">per 1 {latestRate.baseCurrency}</p>
                </div>
                <p className="font-mono text-sm tabular-nums">{formatNumber(rate, 8)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
