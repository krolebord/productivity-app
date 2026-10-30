import type { AssistantModel, AssistantModelInputModality } from "./models";

export function formatCost(cost: number) {
  if (cost > 0 && cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatModelPrice(price: number) {
  if (price >= 1) return `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`;
  return `$${price.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function formatModelPricing(model: Pick<AssistantModel, "pricing">) {
  return `${formatModelPrice(model.pricing.inputPerMillion)} in / ${formatModelPrice(model.pricing.outputPerMillion)} out per 1M`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MODEL_MODALITY_LABELS = {
  audio: "Audio input",
  file: "File input",
  image: "Image input",
  text: "Text input",
  video: "Video input",
} as const satisfies Record<AssistantModelInputModality, string>;
