import { describe, expect, it } from "vitest";
import { formatCost, formatFileSize, formatModelPricing } from "./format";

describe("formatCost", () => {
  it("keeps sub-cent costs visible", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(1.5)).toBe("$1.50");
  });
});

describe("formatModelPricing", () => {
  it("trims cheap prices and keeps whole dollars short", () => {
    expect(formatModelPricing({ pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 } })).toBe(
      "$0.15 in / $0.6 out per 1M",
    );
    expect(formatModelPricing({ pricing: { inputPerMillion: 2, outputPerMillion: 12.5 } })).toBe(
      "$2 in / $12.50 out per 1M",
    );
  });
});

describe("formatFileSize", () => {
  it("picks a unit", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
