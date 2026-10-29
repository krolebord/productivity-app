/**
 * Currency and number formatting shared by every finance surface. Keep all
 * money rendering here so balances, transaction amounts, chart axes and the
 * rate table can't drift apart in fraction digits or symbol style.
 *
 * Strings are built by hand on top of a plain en-US decimal format instead of
 * Intl's currency style: Hermes' iOS Intl ignores `currencyDisplay:
 * "narrowSymbol"` and `notation: "compact"` and has no `formatToParts`, so the
 * phone printed "1 234,50 US$" (simulator region en-UA) where the browser
 * printed "$1,234.50". Pinning the locale keeps web and mobile identical; the
 * output matches Intl's en-US narrow-symbol format (see format.test.ts).
 */

const NBSP = "\u00a0";

/**
 * CLDR narrow symbols for the app's currencies. Symbols ending in a letter are
 * spaced from the digits, as CLDR's currency spacing rule does.
 */
const CURRENCY_PREFIX: Record<string, string> = {
  AUD: "$",
  BRL: "R$",
  CAD: "$",
  CHF: `CHF${NBSP}`,
  CNY: "¥",
  CZK: `Kč${NBSP}`,
  DKK: `kr${NBSP}`,
  EUR: "€",
  GBP: "£",
  HKD: "$",
  HUF: `Ft${NBSP}`,
  IDR: `Rp${NBSP}`,
  ILS: "₪",
  INR: "₹",
  ISK: `kr${NBSP}`,
  JPY: "¥",
  KRW: "₩",
  MXN: "$",
  MYR: `RM${NBSP}`,
  NOK: `kr${NBSP}`,
  NZD: "$",
  PHP: "₱",
  PLN: `zł${NBSP}`,
  RON: `lei${NBSP}`,
  SEK: `kr${NBSP}`,
  SGD: "$",
  THB: "฿",
  TRY: "₺",
  UAH: "₴",
  USD: "$",
  ZAR: `R${NBSP}`,
};

const COMPACT_UNITS = [
  { value: 1e12, suffix: "T" },
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
];

const decimalFormats = new Map<string, Intl.NumberFormat>();

/** Unsigned en-US digits; the formatters are cached since money renders in long lists. */
function formatDigits(value: number, minimumFractionDigits: number, maximumFractionDigits: number): string {
  const key = `${minimumFractionDigits}:${maximumFractionDigits}`;
  let format = decimalFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-US", { minimumFractionDigits, maximumFractionDigits });
    decimalFormats.set(key, format);
  }
  return format.format(Math.abs(value));
}

/** Abbreviates to K/M/B/T with at most one decimal, rolling 999.95K over to 1M as Intl does. */
function formatCompactDigits(value: number): string {
  const abs = Math.abs(value);
  for (const [index, unit] of COMPACT_UNITS.entries()) {
    if (abs < unit.value) continue;
    const scaled = Math.round((abs / unit.value) * 10) / 10;
    const larger = COMPACT_UNITS[index - 1];
    if (larger && scaled >= 1000) return `${formatDigits(abs / larger.value, 0, 1)}${larger.suffix}`;
    return `${formatDigits(scaled, 0, 1)}${unit.suffix}`;
  }
  const rounded = formatDigits(abs, 0, 1);
  return rounded === "1,000" ? "1K" : rounded;
}

/** "-" only when something non-zero survives rounding, so -0.001 doesn't print as "-$0.00". */
function withSign(value: number, digits: string, prefix = ""): string {
  const negative = value < 0 && /[1-9]/.test(digits);
  return `${negative ? "-" : ""}${prefix}${digits}`;
}

function currencyPrefix(currency: string): string {
  return CURRENCY_PREFIX[currency] ?? `${currency}${NBSP}`;
}

/** Money with both fraction digits pinned — the default for balances and amounts. */
export function formatBalance(value: number, currency: string): string {
  return withSign(value, formatDigits(value, 2, 2), currencyPrefix(currency));
}

/** Money abbreviated for tight spots (sidebar rows, dense lists). */
export function formatCompactBalance(value: number, currency: string): string {
  return withSign(value, formatCompactDigits(value), currencyPrefix(currency));
}

/** Bare compact number for chart axes, where the currency is stated elsewhere. */
export function formatCompactNumber(value: number): string {
  return withSign(value, formatCompactDigits(value));
}

/** Exchange rates need far more precision than money. */
export function formatRate(value: number, maximumFractionDigits = 6): string {
  return withSign(value, formatDigits(value, 0, maximumFractionDigits));
}
