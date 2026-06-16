export type AssistantModelId =
  | "deepseek/deepseek-v4-flash"
  | "deepseek/deepseek-v4-pro"
  | "openai/gpt-5.5"
  | "openai/gpt-5.4-mini"
  | "google/gemini-3-flash-preview"
  | "xiaomi/mimo-v2.5-pro";

export type AssistantModel = {
  id: AssistantModelId;
  label: string;
};

export const ASSISTANT_MODELS: AssistantModel[] = [
  { id: "openai/gpt-5.5", label: "GPT-5.5" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { id: "xiaomi/mimo-v2.5-pro", label: "MiMo V2.5 Pro" },
];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = "openai/gpt-5.5";

export function isAssistantModelId(value: unknown): value is AssistantModelId {
  return typeof value === "string" && ASSISTANT_MODELS.some((model) => model.id === value);
}

export function resolveAssistantModelId(value: unknown): AssistantModelId {
  return isAssistantModelId(value) ? value : DEFAULT_ASSISTANT_MODEL;
}
