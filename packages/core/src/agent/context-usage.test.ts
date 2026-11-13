import { describe, expect, it } from "vitest";
import { CONTEXT_COMPACT_AFTER_TOKENS, contextUsageFraction, formatContextUsage } from "./context-usage";

describe("contextUsageFraction", () => {
  it("is the share of the compaction limit, clamped to 0–1", () => {
    expect(contextUsageFraction(0)).toBe(0);
    expect(contextUsageFraction(-5)).toBe(0);
    expect(contextUsageFraction(Number.NaN)).toBe(0);
    expect(contextUsageFraction(CONTEXT_COMPACT_AFTER_TOKENS / 2)).toBe(0.5);
    expect(contextUsageFraction(CONTEXT_COMPACT_AFTER_TOKENS * 3)).toBe(1);
  });
});

describe("formatContextUsage", () => {
  it("shows the percentage and rounded token counts", () => {
    expect(formatContextUsage(84_400)).toBe("36% of context used · 84k of 232k tokens");
    expect(formatContextUsage(640)).toBe("0% of context used · 640 of 232k tokens");
  });
});
