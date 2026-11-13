import type { AssistantReasoningEffort } from "./models";

/**
 * Hand-maintained catalog input — the single source of truth for *which* models the
 * assistant exposes and for the editorial decisions OpenRouter can't make for us.
 *
 * Everything factual (pricing, input modalities, supported reasoning efforts,
 * intelligence score) is scraped from OpenRouter into `models.gen.ts` by
 * `scripts/sync-models.ts` (`pnpm sync:models`). Do not put scraped data here.
 *
 * Fields:
 * - `name`                 display label; falls back to OpenRouter's name when omitted.
 * - `default`              marks the default model. Exactly one entry must set this.
 * - `selectable`           set `false` to keep a model available (e.g. legacy support)
 *                          but hidden from the model picker.
 * - `aliases`              previous ids that resolve to this model. Use when a slug is
 *                          retired from OpenRouter and should no longer be a catalog entry.
 * - `reasoningEffort`      override the provider's default effort for this model.
 * - `selectableReasoning`  force the per-conversation effort toggle on/off. When omitted
 *                          it is inferred: a model is toggleable when it exposes more than
 *                          one reasoning effort.
 */
export type SupportedModel = {
  id: string;
  name?: string;
  default?: boolean;
  selectable?: boolean;
  aliases?: readonly string[];
  reasoningEffort?: AssistantReasoningEffort;
  selectableReasoning?: boolean;
};

export const SUPPORTED_MODELS = [
  { id: "meta/muse-spark-1.3-contributor", name: "Muse Spark 1.3", default: true },
  { id: "meta/muse-ember", name: "Muse Ember", reasoningEffort: "medium" },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5" },
  { id: "openai/gpt-6.1-terra", name: "GPT-6.1 Terra" },
  // Legacy — kept resolvable for existing conversations, hidden from the picker.
  { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash", aliases: ["stealth/ox-alpha"], selectable: false },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", selectable: false },
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", reasoningEffort: "high", selectable: false },
  { id: "deepseek/deepseek-v4-pro-0813", name: "DeepSeek V4 Pro", selectable: false },
  { id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra", selectable: false },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", reasoningEffort: "low", selectable: false },
  { id: "x-ai/grok-4.5", name: "Grok 4.5", selectable: false },
  { id: "qwen/qwen3.8-27b", name: "Qwen3.8 27B", selectable: false },
  { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash", selectable: false },
  { id: "deepseek/deepseek-v4-flash-0731", name: "DeepSeek V4 Flash", selectable: false },
  { id: "xiaomi/mimo-v2.5", name: "MiMo V2.5", selectable: false },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro (preview)", selectable: false },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash (preview)", selectable: false },
  { id: "xiaomi/mimo-v2.5-pro", name: "MiMo V2.5 Pro", selectable: false },
  { id: "openai/gpt-5.5", name: "GPT-5.5", selectable: false },
  { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini", selectable: false },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash", selectable: false },
  { id: "minimax/minimax-m3", name: "MiniMax M3", selectable: false },
] as const satisfies readonly SupportedModel[];
