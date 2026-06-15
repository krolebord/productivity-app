export type AssistantModelId =
  | "deepseek/deepseek-v4-pro"
  | "openai/gpt-5.5"
  | "openai/gpt-5.4-mini"
  | "google/gemini-3-flash-preview";

export type AssistantModel = {
  id: AssistantModelId;
  label: string;
};

export const ASSISTANT_MODELS: AssistantModel[] = [
  { id: "openai/gpt-5.5", label: "GPT-5.5" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = "openai/gpt-5.5";

export function isAssistantModelId(value: unknown): value is AssistantModelId {
  return typeof value === "string" && ASSISTANT_MODELS.some((model) => model.id === value);
}

export function resolveAssistantModelId(value: unknown): AssistantModelId {
  return isAssistantModelId(value) ? value : DEFAULT_ASSISTANT_MODEL;
}
