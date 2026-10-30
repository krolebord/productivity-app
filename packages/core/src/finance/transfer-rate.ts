import { formatRate } from "../currency/format";

/**
 * The implied exchange rate of a cross-currency transfer, quoted so the rate is at least 1
 * ("1 EUR = 43.25 UAH" rather than "1 UAH = 0.0231 EUR"). Null until both amounts are positive.
 */
export function formatTransferRate(sent: number, received: number, currency: string, counterpartyCurrency: string) {
  if (!(sent > 0 && received > 0)) return null;

  const quote = (rate: number) => formatRate(rate, rate >= 10 ? 2 : 4);
  return sent >= received
    ? `1 ${counterpartyCurrency} = ${quote(sent / received)} ${currency}`
    : `1 ${currency} = ${quote(received / sent)} ${counterpartyCurrency}`;
}
