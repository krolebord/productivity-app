import type { Telemetry } from "ai";
import type { PostHog } from "posthog-node";

type TraceOptions = {
  distinctId: string;
  traceId: string;
  sessionId: string;
};

type OpenRouterUsage = { cost?: number };

const MAX_PROPERTY_CHARS = 200_000;

// Uploads (bank statements, receipts) reach the model as file parts and `read` tool results;
// keep their bytes out of analytics, as @posthog/ai did.
function redactBinary(value: unknown): unknown {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return "[binary redacted]";
  if (Array.isArray(value)) return value.map(redactBinary);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    redacted[key] =
      "mediaType" in record && key === "data" ? `[${String(record.mediaType)} redacted]` : redactBinary(entry);
  }
  return redacted;
}

function analyticsValue(value: unknown): unknown {
  const redacted = redactBinary(value);
  const json = JSON.stringify(redacted) ?? "";
  return json.length > MAX_PROPERTY_CHARS ? `${json.slice(0, MAX_PROPERTY_CHARS)}… [truncated]` : redacted;
}

// @posthog/ai's withTracing only wraps AI SDK v5/v6 models; this reports the same
// $ai_generation events through AI SDK 7's telemetry callbacks instead.
export function posthogTelemetry(client: PostHog, options: TraceOptions): Telemetry {
  const calls = new Map<string, { input: unknown; tools: unknown }>();
  const base = {
    $ai_trace_id: options.traceId,
    $ai_session_id: options.sessionId,
    $ai_lib: "productivity-ai-sdk-telemetry",
    $ai_framework: "vercel",
    $ai_framework_version: "7",
  };

  return {
    onLanguageModelCallStart(event) {
      const input = event.instructions
        ? [{ role: "system", content: event.instructions }, ...event.messages]
        : event.messages;
      calls.set(event.callId, { input, tools: event.tools });
    },
    onLanguageModelCallEnd(event) {
      const call = calls.get(event.callId);
      calls.delete(event.callId);
      const openrouter = event.providerMetadata?.openrouter as { usage?: OpenRouterUsage } | undefined;
      client.capture({
        distinctId: options.distinctId,
        event: "$ai_generation",
        properties: {
          ...base,
          $ai_provider: event.provider,
          $ai_model: event.modelId,
          $ai_input: analyticsValue(call?.input),
          $ai_tools: analyticsValue(call?.tools),
          $ai_output_choices: analyticsValue([{ role: "assistant", content: event.content }]),
          $ai_input_tokens: event.usage.inputTokens,
          $ai_output_tokens: event.usage.outputTokens,
          $ai_reasoning_tokens: event.usage.outputTokenDetails.reasoningTokens,
          $ai_cache_read_input_tokens: event.usage.inputTokenDetails.cacheReadTokens,
          $ai_cache_creation_input_tokens: event.usage.inputTokenDetails.cacheWriteTokens,
          $ai_total_cost_usd: openrouter?.usage?.cost,
          $ai_latency: event.performance.responseTimeMs / 1000,
          $ai_stop_reason: event.finishReason,
          $ai_completion_id: event.responseId,
          $ai_http_status: 200,
          $ai_is_error: false,
        },
      });
    },
    onStepError(event) {
      client.capture({
        distinctId: options.distinctId,
        event: "$ai_generation",
        properties: {
          ...base,
          $ai_provider: event.provider,
          $ai_model: event.modelId,
          $ai_is_error: true,
          $ai_error: event.error instanceof Error ? event.error.message : String(event.error),
        },
      });
    },
  };
}
