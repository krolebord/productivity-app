import type { CurrencyRateItem } from "@/user-db/migrations";
import { APP_CURRENCIES, type AppCurrencyCode } from "./currencies";

/** Rate stored as "units of `currency` per 1 unit of the row's base currency". */
export function getRate(row: CurrencyRateItem, currency: AppCurrencyCode): number | null {
  if (currency === row.baseCurrency) {
    return 1;
  }

  const rate = row[currency];
  return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
}

/** Currencies that have a usable rate in the given row. */
export function getCurrencyOptions(row: CurrencyRateItem): AppCurrencyCode[] {
  return APP_CURRENCIES.filter((currency) => getRate(row, currency) !== null);
}

/**
 * Cross-convert an amount between two currencies using a single rate row. Both
 * legs are taken relative to the row's base, so the row's own base currency is
 * irrelevant as long as both currencies are present. Returns null when either
 * currency is missing from the row.
 */
export function convertAmount(row: CurrencyRateItem, amount: number, from: string, to: string): number | null {
  const fromRate = getRate(row, from as AppCurrencyCode);
  const toRate = getRate(row, to as AppCurrencyCode);

  if (fromRate === null || toRate === null) {
    return null;
  }

  return (amount / fromRate) * toRate;
}
