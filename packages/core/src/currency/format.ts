/**
 * Currency and number formatting shared by every finance surface. Keep all
 * money rendering here so balances, transaction amounts, chart axes and the
 * rate table can't drift apart in fraction digits or symbol style.
 */

function formatWithFallback(
  value: number,
  currency: string,
  options: Intl.NumberFormatOptions,
  fallback: (value: number) => string,
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      ...options,
    }).format(value);
  } catch {
    // Intl throws on currency codes it doesn't know; fall back to a plain code + number.
    return `${currency} ${fallback(value)}`;
  }
}

/** Money with both fraction digits pinned — the default for balances and amounts. */
export function formatBalance(value: number, currency: string): string {
  return formatWithFallback(value, currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, (amount) =>
    amount.toFixed(2),
  );
}

/** Money abbreviated for tight spots (sidebar rows, dense lists). */
export function formatCompactBalance(value: number, currency: string): string {
  return formatWithFallback(value, currency, { notation: "compact", maximumFractionDigits: 1 }, (amount) =>
    amount.toFixed(0),
  );
}

/** Bare compact number for chart axes, where the currency is stated elsewhere. */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Exchange rates need far more precision than money. */
export function formatRate(value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}
