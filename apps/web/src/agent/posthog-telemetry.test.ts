import type { PostHog } from "posthog-node";
import { describe, expect, it } from "vitest";
import { posthogTelemetry } from "./posthog-telemetry";

type Captured = { distinctId: string; event: string; properties: Record<string, unknown> };

function setup() {
  const captured: Captured[] = [];
  const client = { capture: (event: Captured) => captured.push(event) } as unknown as PostHog;
  const telemetry = posthogTelemetry(client, { distinctId: "user-1", traceId: "trace-1", sessionId: "conv-1" });
  return { captured, telemetry };
}

const usage = {
  inputTokens: 120,
  inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 0 },
  outputTokens: 30,
  outputTokenDetails: { textTokens: 25, reasoningTokens: 5 },
  totalTokens: 150,
};

function callStart(callId: string, messages: unknown[]) {
  return { callId, provider: "openrouter.chat", modelId: "model-a", instructions: "Be brief.", messages, tools: [] };
}

function callEnd(callId: string) {
  return {
    callId,
    provider: "openrouter.chat",
    modelId: "model-a",
    finishReason: "stop",
    usage,
    content: [{ type: "text", text: "Hi" }],
    responseId: "resp-1",
    providerMetadata: { openrouter: { usage: { cost: 0.0042 } } },
    performance: { responseTimeMs: 1500 },
  };
}

describe("posthogTelemetry", () => {
  it("captures one $ai_generation per model call with usage, cost and trace ids", async () => {
    const { captured, telemetry } = setup();
    await telemetry.onLanguageModelCallStart?.(callStart("call-1", [{ role: "user", content: "Hello" }]) as never);
    await telemetry.onLanguageModelCallEnd?.(callEnd("call-1") as never);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      distinctId: "user-1",
      event: "$ai_generation",
      properties: {
        $ai_trace_id: "trace-1",
        $ai_session_id: "conv-1",
        $ai_model: "model-a",
        $ai_input: [
          { role: "system", content: "Be brief." },
          { role: "user", content: "Hello" },
        ],
        $ai_input_tokens: 120,
        $ai_output_tokens: 30,
        $ai_reasoning_tokens: 5,
        $ai_cache_read_input_tokens: 20,
        $ai_total_cost_usd: 0.0042,
        $ai_latency: 1.5,
        $ai_is_error: false,
      },
    });
  });

  it("redacts file bytes and caps oversized inputs", async () => {
    const { captured, telemetry } = setup();
    const file = { type: "file", mediaType: "application/pdf", data: { type: "data", data: "JVBERi0xLjQK" } };
    const fileBytes = { type: "file", mediaType: "image/png", data: new Uint8Array([1, 2, 3]) };
    await telemetry.onLanguageModelCallStart?.(
      callStart("call-1", [{ role: "user", content: [file, fileBytes] }]) as never,
    );
    await telemetry.onLanguageModelCallEnd?.(callEnd("call-1") as never);
    await telemetry.onLanguageModelCallStart?.(
      callStart("call-2", [{ role: "user", content: "x".repeat(300_000) }]) as never,
    );
    await telemetry.onLanguageModelCallEnd?.(callEnd("call-2") as never);

    const redacted = JSON.stringify(captured[0].properties.$ai_input);
    expect(redacted).not.toContain("JVBERi0xLjQK");
    expect(redacted).toContain("[application/pdf redacted]");
    expect(redacted).toContain("[image/png redacted]");

    const capped = captured[1].properties.$ai_input;
    expect(typeof capped).toBe("string");
    expect((capped as string).length).toBeLessThan(201_000);
    expect(capped).toMatch(/\[truncated\]$/);
  });
});
