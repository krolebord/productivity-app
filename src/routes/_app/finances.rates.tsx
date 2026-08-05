import { createFileRoute } from "@tanstack/react-router";
import { ArrowRightLeftIcon, CoinsIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { CurrencySelect } from "@/components/currency-select";
import { EmptyState, SectionCard } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrencyOptions, getRate } from "@/lib/currency/convert";
import { APP_CURRENCIES, type AppCurrencyCode } from "@/lib/currency/currencies";
import { formatBalance, formatRate } from "@/lib/currency/format";
import { useRefreshRates } from "@/lib/currency/use-refresh-rates";
import { cn } from "@/lib/utils";
import { useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/finances/rates")({
  component: RatesPage,
});

function RatesPage() {
  const [amount, setAmount] = useState("100");
  const [fromCurrency, setFromCurrency] = useState<AppCurrencyCode>("USD");
  const [toCurrency, setToCurrency] = useState<AppCurrencyCode>("EUR");

  const { data: rates } = useDbQuery((db) =>
    db.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc"),
  );
  const latestRate = rates[0];

  const { refreshRates, isRefreshing } = useRefreshRates();

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

  if (!latestRate) {
    return (
      <EmptyState
        icon={<CoinsIcon className="size-8 text-muted-foreground" />}
        title="No exchange rates stored yet"
        description="Fetch rates to convert balances and totals into your display currency."
        action={
          <Button onClick={refreshRates} size="sm" variant="outline" disabled={isRefreshing}>
            <RefreshCwIcon className={isRefreshing ? "animate-spin" : undefined} />
            Refresh rates
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Converter" icon={<ArrowRightLeftIcon className="size-4 text-muted-foreground" />}>
        <div className="grid @4xl:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)_minmax(260px,1fr)] @4xl:items-end gap-4 p-4">
          <div className="grid @4xl:max-w-sm gap-2">
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
                "mt-1 font-mono font-semibold text-2xl tabular-nums",
                convertedAmount === null && "text-muted-foreground",
              )}
            >
              {convertedAmount === null ? "—" : formatBalance(convertedAmount, toCurrency)}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Stored rates"
        icon={<CoinsIcon className="size-4 text-muted-foreground" />}
        actions={
          <span className="text-muted-foreground text-xs">
            {latestRate.date} · based on {latestRate.baseCurrency}
          </span>
        }
      >
        <div className="grid @4xl:grid-cols-3 @md:grid-cols-2 grid-cols-1">
          {ratesForDisplay.map(({ currency, rate }) => (
            <div
              key={currency}
              className="flex items-center justify-between gap-4 border-b px-4 py-3 @md:odd:border-r @4xl:[&:not(:nth-child(3n))]:border-r"
            >
              <div>
                <p className="font-medium text-sm">{currency}</p>
                <p className="text-muted-foreground text-xs">per 1 {latestRate.baseCurrency}</p>
              </div>
              <p className="font-mono text-sm tabular-nums">{formatRate(rate, 8)}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
