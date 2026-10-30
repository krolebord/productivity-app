import { describe, expect, it, vi } from "vitest";
import { createAgentWarmer, needsTranscriptBackfill } from "./agent-warmer";

describe("createAgentWarmer", () => {
  it("throttles per conversation", () => {
    let now = 0;
    const ensure = vi.fn(() => Promise.resolve());
    const warm = createAgentWarmer(ensure, { intervalMs: 1000, now: () => now });

    warm("a");
    warm("a");
    warm("b");
    expect(ensure).toHaveBeenCalledTimes(2);

    now = 999;
    warm("a");
    expect(ensure).toHaveBeenCalledTimes(2);
    now = 1000;
    warm("a");
    expect(ensure).toHaveBeenCalledTimes(3);
  });

  it("retries right away after a failed call", async () => {
    const ensure = vi.fn(() => Promise.reject(new Error("offline")));
    const warm = createAgentWarmer(ensure, { now: () => 0 });

    warm("a");
    await Promise.resolve();
    await Promise.resolve();
    warm("a");
    expect(ensure).toHaveBeenCalledTimes(2);
  });
});

describe("needsTranscriptBackfill", () => {
  it("only asks for started conversations with no synced messages", () => {
    expect(needsTranscriptBackfill(null, 0)).toBe(false);
    expect(needsTranscriptBackfill({ title: "", totalTokens: 0 }, 0)).toBe(false);
    expect(needsTranscriptBackfill({ title: "Budget", totalTokens: 0 }, 0)).toBe(true);
    expect(needsTranscriptBackfill({ title: "", totalTokens: 120 }, 0)).toBe(true);
    expect(needsTranscriptBackfill({ title: "Budget", totalTokens: 120 }, 4)).toBe(false);
  });
});
