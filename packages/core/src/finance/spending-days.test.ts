import { describe, expect, it } from "vitest";
import { MAX_SPENDING_DAYS, MIN_SPENDING_DAYS, spendingDaysForWidth } from "./spending-days";

describe("spendingDaysForWidth", () => {
  it("falls back before the column has been measured", () => {
    expect(spendingDaysForWidth(0)).toBe(14);
  });

  it("keeps a full week when the plot would otherwise go thinner", () => {
    expect(spendingDaysForWidth(240)).toBe(MIN_SPENDING_DAYS);
  });

  it("grows with the plot and never exceeds the fetch window", () => {
    expect(spendingDaysForWidth(360)).toBe(11);
    expect(spendingDaysForWidth(768)).toBe(30);
    expect(spendingDaysForWidth(2000)).toBe(MAX_SPENDING_DAYS);
  });
});
