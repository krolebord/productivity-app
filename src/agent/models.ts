export type AssistantModelId =
  | "deepseek/deepseek-v4-flash"
  | "deepseek/deepseek-v4-pro"
  | "openai/gpt-5.5"
  | "openai/gpt-5.4-mini"
  | "google/gemini-3-flash-preview"
  | "minimax/minimax-m3"
  | "xiaomi/mimo-v2.5"
  | "xiaomi/mimo-v2.5-pro";

export type AssistantModelInputModality = "audio" | "file" | "image" | "text" | "video";

export type AssistantModel = {
  id: AssistantModelId;
  label: string;
  inputModalities: AssistantModelInputModality[];
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
  };
};

export const ASSISTANT_MODELS: AssistantModel[] = [
  {
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 5, outputPerMillion: 30, cacheReadPerMillion: 0.5 },
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    inputModalities: ["text", "image", "file"],
    pricing: { inputPerMillion: 0.75, outputPerMillion: 4.5, cacheReadPerMillion: 0.075 },
  },
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    inputModalities: ["text"],
    pricing: { inputPerMillion: 0.09, outputPerMillion: 0.18, cacheReadPerMillion: 0.02 },
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    inputModalities: ["text"],
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87, cacheReadPerMillion: 0.003625 },
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    inputModalities: ["text", "image", "file", "audio", "video"],
    pricing: { inputPerMillion: 0.5, outputPerMillion: 3, cacheReadPerMillion: 0.05 },
  },
  {
    id: "minimax/minimax-m3",
    label: "MiniMax M3",
    inputModalities: ["text", "image", "video"],
    pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2, cacheReadPerMillion: 0.06 },
  },
  {
    id: "xiaomi/mimo-v2.5",
    label: "MiMo V2.5",
    inputModalities: ["text", "image", "audio", "video"],
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28, cacheReadPerMillion: 0.0028 },
  },
  {
    id: "xiaomi/mimo-v2.5-pro",
    label: "MiMo V2.5 Pro",
    inputModalities: ["text"],
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87, cacheReadPerMillion: 0.0036 },
  },
];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = "openai/gpt-5.5";

export function isAssistantModelId(value: unknown): value is AssistantModelId {
  return typeof value === "string" && ASSISTANT_MODELS.some((model) => model.id === value);
}

export function resolveAssistantModelId(value: unknown): AssistantModelId {
  return isAssistantModelId(value) ? value : DEFAULT_ASSISTANT_MODEL;
}
