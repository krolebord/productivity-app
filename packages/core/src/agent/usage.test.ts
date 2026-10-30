import { describe, expect, it } from "vitest";
import { summarizeAssistantUsage, usageModelLabel } from "./usage";

const rows = [
  { tombstone: false, model: "z-ai/glm-5.3-flash", totalCost: 0.5, totalTokens: 1000 },
  // A retired alias folds into its catalog model.
  { tombstone: false, model: "stealth/ox-alpha", totalCost: 0.25, totalTokens: 500 },
  { tombstone: true, model: "openai/gpt-5.6-sol", totalCost: 2, totalTokens: 4000 },
  { tombstone: false, model: null, totalCost: 0, totalTokens: 0 },
];

describe("summarizeAssistantUsage", () => {
  it("skips deleted conversations in the live scope", () => {
    const live = summarizeAssistantUsage(rows, "live");
    expect(live.conversations).toBe(3);
    expect(live.totalCost).toBe(0.75);
    expect(live.totalTokens).toBe(1500);
    expect(live.averageCost).toBe(0.25);
    expect(live.models).toEqual([
      { model: "z-ai/glm-5.3-flash", conversations: 2, cost: 0.75 },
      { model: null, conversations: 1, cost: 0 },
    ]);
  });

  it("covers everything in the all scope, most expensive first", () => {
    const all = summarizeAssistantUsage(rows, "all");
    expect(all.conversations).toBe(4);
    expect(all.models[0]).toEqual({ model: "openai/gpt-5.6-sol", conversations: 1, cost: 2 });
  });

  it("averages to zero with no conversations", () => {
    expect(summarizeAssistantUsage([], "live").averageCost).toBe(0);
  });
});

describe("usageModelLabel", () => {
  it("labels catalog, unknown and missing models", () => {
    expect(usageModelLabel("z-ai/glm-5.3-flash")).toBe("GLM 5.3 Flash");
    expect(usageModelLabel("vendor/unknown")).toBe("vendor/unknown");
    expect(usageModelLabel(null)).toBe("No model");
  });
});
