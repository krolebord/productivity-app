import { describe, expect, it } from "vitest";
import { APP_CURRENCIES, CURRENCY_NAMES, currencyName, currencyOptions, sortCurrencies } from "./currencies";

describe("sortCurrencies", () => {
  it("lists the priority currencies first, in their fixed order", () => {
    expect(sortCurrencies(APP_CURRENCIES).slice(0, 5)).toEqual(["CHF", "UAH", "USD", "EUR", "AUD"]);
  });

  it("skips priority currencies that aren't available and keeps the rest in order", () => {
    expect(sortCurrencies(["GBP", "AUD", "USD", "JPY"])).toEqual(["USD", "GBP", "AUD", "JPY"]);
  });

  it("keeps every currency exactly once", () => {
    expect([...sortCurrencies(APP_CURRENCIES)].sort()).toEqual([...APP_CURRENCIES].sort());
  });
});

describe("currencyName", () => {
  it("names every app currency", () => {
    for (const currency of APP_CURRENCIES) expect(CURRENCY_NAMES[currency]).toBeTruthy();
  });

  it("falls back to the code for unknown currencies", () => {
    expect(currencyName("XYZ")).toBe("XYZ");
  });
});

describe("currencyOptions", () => {
  it("pairs sorted codes with names", () => {
    expect(currencyOptions(["EUR", "CHF"])).toEqual([
      { currency: "CHF", name: "Swiss Franc" },
      { currency: "EUR", name: "Euro" },
    ]);
  });
});
