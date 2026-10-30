export const APP_CURRENCIES = [
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "RON",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "UAH",
  "USD",
  "ZAR",
] as const;

export type AppCurrencyCode = (typeof APP_CURRENCIES)[number];

/** Listed first in currency pickers, in this order; the rest follow alphabetically. */
export const PRIORITY_CURRENCIES = ["CHF", "UAH", "USD", "EUR"] as const satisfies readonly AppCurrencyCode[];

/**
 * English names for the picker. Spelled out rather than read from `Intl.DisplayNames`,
 * which Hermes doesn't implement, so web and mobile list the same names.
 */
export const CURRENCY_NAMES: Record<AppCurrencyCode, string> = {
  AUD: "Australian Dollar",
  BRL: "Brazilian Real",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  CNY: "Chinese Yuan",
  CZK: "Czech Koruna",
  DKK: "Danish Krone",
  EUR: "Euro",
  GBP: "British Pound",
  HKD: "Hong Kong Dollar",
  HUF: "Hungarian Forint",
  IDR: "Indonesian Rupiah",
  ILS: "Israeli New Shekel",
  INR: "Indian Rupee",
  ISK: "Icelandic Króna",
  JPY: "Japanese Yen",
  KRW: "South Korean Won",
  MXN: "Mexican Peso",
  MYR: "Malaysian Ringgit",
  NOK: "Norwegian Krone",
  NZD: "New Zealand Dollar",
  PHP: "Philippine Peso",
  PLN: "Polish Zloty",
  RON: "Romanian Leu",
  SEK: "Swedish Krona",
  SGD: "Singapore Dollar",
  THB: "Thai Baht",
  TRY: "Turkish Lira",
  UAH: "Ukrainian Hryvnia",
  USD: "US Dollar",
  ZAR: "South African Rand",
};

export function currencyName(currency: string): string {
  return CURRENCY_NAMES[currency as AppCurrencyCode] ?? currency;
}

/** Picker order: the priority currencies that are available, then the rest in their given order. */
export function sortCurrencies<T extends string>(currencies: readonly T[]): T[] {
  const available = new Set<string>(currencies);
  const priority = PRIORITY_CURRENCIES.filter((currency) => available.has(currency)) as string[] as T[];
  const rest = currencies.filter((currency) => !(PRIORITY_CURRENCIES as readonly string[]).includes(currency));
  return [...priority, ...rest];
}

/** Sorted picker options with their display names. */
export function currencyOptions<T extends string>(currencies: readonly T[]): { currency: T; name: string }[] {
  return sortCurrencies(currencies).map((currency) => ({ currency, name: currencyName(currency) }));
}
