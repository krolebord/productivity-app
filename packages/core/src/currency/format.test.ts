import { describe, expect, it } from "vitest";
import { APP_CURRENCIES } from "./currencies";
import { formatBalance, formatCompactBalance, formatCompactNumber, formatRate } from "./format";

// Node ships full ICU, so Intl's en-US narrow-symbol output is the reference the
// hand-built strings must match (Hermes can't produce it, which is why they exist).
const intlBalance = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const SAMPLES = [0, 0.5, 7, -42.1, 999.95, 1234.5, -1234.5, 99_999, 999_950, 1_234_567, -98_765_432, 1.5e9];

describe("currency formatting", () => {
  it.each(APP_CURRENCIES)("matches Intl's en-US narrow-symbol balances for %s", (currency) => {
    for (const value of SAMPLES) expect(formatBalance(value, currency)).toBe(intlBalance(value, currency));
  });

  it("doesn't print a minus for amounts that round to zero", () => {
    expect(formatBalance(-0.004, "USD")).toBe("$0.00");
    expect(formatCompactNumber(-0.04)).toBe("0");
  });

  it("abbreviates compact numbers like Intl's en-US compact notation", () => {
    for (const value of SAMPLES) {
      expect(formatCompactNumber(value)).toBe(
        new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value),
      );
    }
  });

  // Intl pads compact currency to one decimal ("$1.0K"); the hand-built version drops it.
  it("abbreviates compact balances without padding", () => {
    expect(formatCompactBalance(1234.5, "USD")).toBe("$1.2K");
    expect(formatCompactBalance(99_999, "EUR")).toBe("€100K");
    expect(formatCompactBalance(999_950, "USD")).toBe("$1M");
    expect(formatCompactBalance(-1_234_567, "PLN")).toBe("-zł\u00a01.2M");
    expect(formatCompactBalance(42, "UAH")).toBe("₴42");
  });

  it("falls back to the code for currencies without a known symbol", () => {
    expect(formatBalance(-12.5, "XYZ")).toBe("-XYZ\u00a012.50");
  });

  it("formats rates with up to six decimals", () => {
    expect(formatRate(41.123456789)).toBe("41.123457");
    expect(formatRate(1234)).toBe("1,234");
  });
});
