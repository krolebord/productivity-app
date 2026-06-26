import type { AppCurrencyCode } from "../currency/currencies";

/**
 * Monobank reports currencies as ISO 4217 numeric codes (e.g. `980`), but the app stores currency
 * as alpha text (`"UAH"`). This map covers the currencies the app supports; codes outside it are
 * unsupported (the account becomes unlinkable rather than failing the whole job).
 */
const NUMERIC_TO_ALPHA: Record<number, AppCurrencyCode> = {
  36: "AUD",
  986: "BRL",
  124: "CAD",
  756: "CHF",
  156: "CNY",
  203: "CZK",
  208: "DKK",
  978: "EUR",
  826: "GBP",
  344: "HKD",
  348: "HUF",
  360: "IDR",
  376: "ILS",
  356: "INR",
  352: "ISK",
  392: "JPY",
  410: "KRW",
  484: "MXN",
  458: "MYR",
  578: "NOK",
  554: "NZD",
  608: "PHP",
  985: "PLN",
  946: "RON",
  752: "SEK",
  702: "SGD",
  764: "THB",
  949: "TRY",
  980: "UAH",
  840: "USD",
  710: "ZAR",
};

/**
 * Convert an ISO 4217 numeric currency code to the app's alpha code, or `null` when the
 * currency is not one the app supports.
 */
export function numericToAlphaCurrency(code: number): AppCurrencyCode | null {
  return NUMERIC_TO_ALPHA[code] ?? null;
}
