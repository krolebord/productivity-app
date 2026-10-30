import { describe, expect, it } from "vitest";
import { formatTransferRate } from "./transfer-rate";

describe("formatTransferRate", () => {
  it("quotes the rate so it is at least 1", () => {
    expect(formatTransferRate(100, 4325, "EUR", "UAH")).toBe("1 EUR = 43.25 UAH");
    expect(formatTransferRate(4325, 100, "UAH", "EUR")).toBe("1 EUR = 43.25 UAH");
  });

  it("keeps four decimals for rates under 10", () => {
    expect(formatTransferRate(100, 108.123456, "EUR", "USD")).toBe("1 EUR = 1.0812 USD");
  });

  it("waits for both amounts", () => {
    expect(formatTransferRate(100, 0, "EUR", "USD")).toBeNull();
    expect(formatTransferRate(Number.NaN, 5, "EUR", "USD")).toBeNull();
  });
});
