export type AssistantModelId =
  | "deepseek/deepseek-v4-flash"
  | "deepseek/deepseek-v4-pro"
  | "openai/gpt-5.6-terra"
  | "openai/gpt-5.6-luna"
  | "openai/gpt-5.6-sol"
  | "openai/gpt-5.5"
  | "openai/gpt-5.4-mini"
  | "google/gemini-3-flash-preview"
  | "minimax/minimax-m3"
  | "x-ai/grok-4.5"
  | "xiaomi/mimo-v2.5"
  | "xiaomi/mimo-v2.5-pro";

export type AssistantModelInputModality = "audio" | "file" | "image" | "text" | "video";

export type AssistantReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type AssistantModel = {
  id: AssistantModelId;
  label: string;
  inputModalities: AssistantModelInputModality[];
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
  };
  reasoningEffort?: AssistantReasoningEffort;
  selectable?: boolean;
};

export const ASSISTANT_MODELS: AssistantModel[] = [
  {
    id: "xiaomi/mimo-v2.5",
    label: "MiMo V2.5",
    inputModalities: ["text", "image", "audio", "video"],
    pricing: { inputPerMillion: 0.105, outputPerMillion: 0.28, cacheReadPerMillion: 0.028 },
  },
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    inputModalities: ["text"],
    pricing: { inputPerMillion: 0.077, outputPerMillion: 0.154, cacheReadPerMillion: 0.0154 },
    reasoningEffort: "high",
  },
  {
    id: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 0.2, outputPerMillion: 2, cacheReadPerMillion: 0.02 },
    reasoningEffort: "high",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    inputModalities: ["text"],
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87, cacheReadPerMillion: 0.003625 },
    reasoningEffort: "high",
  },
  {
    id: "openai/gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2 },
    reasoningEffort: "medium",
  },
  {
    id: "openai/gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5 },
    reasoningEffort: "low",
  },
  {
    id: "x-ai/grok-4.5",
    label: "Grok 4.5",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 2, outputPerMillion: 6, cacheReadPerMillion: 0.5 },
    reasoningEffort: "high",
  },

  {
    id: "xiaomi/mimo-v2.5-pro",
    label: "MiMo V2.5 Pro",
    inputModalities: ["text"],
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87, cacheReadPerMillion: 0.0036 },
    selectable: false,
  },
  {
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5 },
    selectable: false,
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 0.75, outputPerMillion: 4.5, cacheReadPerMillion: 0.075 },
    selectable: false,
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    inputModalities: ["text", "image", "file", "audio", "video"],
    pricing: { inputPerMillion: 0.5, outputPerMillion: 3, cacheReadPerMillion: 0.05 },
    selectable: false,
  },
  {
    id: "minimax/minimax-m3",
    label: "MiniMax M3",
    inputModalities: ["text", "image", "video"],
    pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2, cacheReadPerMillion: 0.06 },
    selectable: false,
  },
];

export const SELECTABLE_ASSISTANT_MODELS = ASSISTANT_MODELS.filter((model) => model.selectable !== false);

export const ASSISTANT_MODELS_BY_PRICE = [...SELECTABLE_ASSISTANT_MODELS].sort(
  (a, b) =>
    a.pricing.inputPerMillion - b.pricing.inputPerMillion || a.pricing.outputPerMillion - b.pricing.outputPerMillion,
);

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = "xiaomi/mimo-v2.5";

export function isAssistantModelId(value: unknown): value is AssistantModelId {
  return typeof value === "string" && ASSISTANT_MODELS.some((model) => model.id === value);
}

export function resolveAssistantModelId(value: unknown): AssistantModelId {
  return isAssistantModelId(value) ? value : DEFAULT_ASSISTANT_MODEL;
}

export function getAssistantModel(id: AssistantModelId): AssistantModel | undefined {
  return ASSISTANT_MODELS.find((model) => model.id === id);
}
