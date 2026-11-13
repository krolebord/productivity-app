import { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL } from "./models.gen";
import type { SUPPORTED_MODELS } from "./supported-models";

/** Model ids are derived from the hand-maintained seed in `supported-models.ts`. */
export type AssistantModelId = (typeof SUPPORTED_MODELS)[number]["id"];

export type AssistantModelInputModality = "audio" | "file" | "image" | "text" | "video";

export type AssistantReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

/** Canonical ascending order for reasoning efforts, used for UI ordering and sorting. */
export const REASONING_EFFORTS_ASCENDING = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly AssistantReasoningEffort[];

/**
 * A model in the catalog. Only `id`, `label`, `inputModalities`, and `pricing` are always
 * present (the generator guarantees them); the rest are optional with sensible defaults
 * applied by the helpers below.
 */
export type AssistantModel = {
  id: AssistantModelId;
  label: string;
  inputModalities: AssistantModelInputModality[];
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
  };
  /** OpenRouter Artificial Analysis intelligence index, when available. */
  intelligenceScore?: number;
  /** Reasoning efforts the model accepts, ascending. Absent for non-reasoning models. */
  supportedReasoningEfforts?: AssistantReasoningEffort[];
  /** Default effort applied when the conversation doesn't override it. */
  reasoningEffort?: AssistantReasoningEffort;
  /** Explicit override for the per-conversation effort toggle; inferred when omitted. */
  selectableReasoning?: boolean;
  /** Hidden from the picker when `false`; still resolvable. Defaults to `true`. */
  selectable?: boolean;
  /** Retired ids that resolve to this catalog entry. */
  aliases?: readonly string[];
};

export { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL };

export const SELECTABLE_ASSISTANT_MODELS = ASSISTANT_MODELS.filter((model) => model.selectable !== false);

export const ASSISTANT_MODELS_BY_PRICE = [...SELECTABLE_ASSISTANT_MODELS].sort(
  (a, b) =>
    a.pricing.inputPerMillion - b.pricing.inputPerMillion || a.pricing.outputPerMillion - b.pricing.outputPerMillion,
);

const ASSISTANT_MODELS_BY_ID = new Map<string, AssistantModel>(ASSISTANT_MODELS.map((model) => [model.id, model]));
const ASSISTANT_MODEL_ALIAS_TO_ID = new Map<string, AssistantModelId>(
  ASSISTANT_MODELS.flatMap((model) => (model.aliases ?? []).map((alias) => [alias, model.id])),
);

export function isAssistantModelId(value: unknown): value is AssistantModelId {
  return typeof value === "string" && ASSISTANT_MODELS_BY_ID.has(value);
}

export function resolveAssistantModelId(value: unknown): AssistantModelId {
  if (typeof value !== "string") return DEFAULT_ASSISTANT_MODEL;
  return getAssistantModel(value)?.id ?? DEFAULT_ASSISTANT_MODEL;
}

/** Like `resolveAssistantModelId`, but hidden models fall back to the default. Use for new conversations. */
export function resolveSelectableAssistantModelId(value: unknown): AssistantModelId {
  const id = resolveAssistantModelId(value);
  return getAssistantModel(id)?.selectable === false ? DEFAULT_ASSISTANT_MODEL : id;
}

export function getAssistantModel(id: string): AssistantModel | undefined {
  const canonical = ASSISTANT_MODEL_ALIAS_TO_ID.get(id) ?? id;
  return ASSISTANT_MODELS_BY_ID.get(canonical);
}

/** Reasoning efforts offered for a model, falling back to the full scale. */
export function getModelReasoningEfforts(id: AssistantModelId): readonly AssistantReasoningEffort[] {
  return getAssistantModel(id)?.supportedReasoningEfforts ?? REASONING_EFFORTS_ASCENDING;
}

/**
 * Whether the UI may override reasoning effort per conversation. Uses the explicit
 * `selectableReasoning` flag when set, otherwise infers it from the model exposing more
 * than one supported effort.
 */
export function modelSupportsSelectableReasoning(id: AssistantModelId): boolean {
  const model = getAssistantModel(id);
  if (!model) return false;
  if (model.selectableReasoning !== undefined) return model.selectableReasoning;
  return (model.supportedReasoningEfforts?.length ?? 0) > 1;
}

export function isAssistantReasoningEffort(value: unknown): value is AssistantReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS_ASCENDING as readonly string[]).includes(value);
}

/** Resolve effort for a turn: catalog default, overridden only when the model allows selection. */
export function resolveAssistantReasoningEffort(
  modelId: AssistantModelId,
  value: unknown,
): AssistantReasoningEffort | undefined {
  const model = getAssistantModel(modelId);
  const defaultEffort = model?.reasoningEffort;
  if (!modelSupportsSelectableReasoning(modelId)) return defaultEffort;
  const supported = getModelReasoningEfforts(modelId);
  return isAssistantReasoningEffort(value) && supported.includes(value) ? value : defaultEffort;
}

export function formatReasoningEffortLabel(effort: AssistantReasoningEffort): string {
  switch (effort) {
    case "none":
      return "None";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "XHigh";
  }
}

/** Effort sent when starting a conversation: the user's preference, or null when the model has no toggle. */
export function preferredConversationReasoningEffort(
  modelId: AssistantModelId,
  preferred: unknown,
): AssistantReasoningEffort | null {
  if (!modelSupportsSelectableReasoning(modelId)) return null;
  return resolveAssistantReasoningEffort(modelId, preferred) ?? null;
}

/**
 * Effort the composer shows: a started conversation's own effort, else the user's preference,
 * falling back to the catalog default.
 */
export function displayedReasoningEffort(
  modelId: AssistantModelId,
  conversationEffort: string | null | undefined,
  preferred: unknown,
): AssistantReasoningEffort {
  return (
    resolveAssistantReasoningEffort(modelId, conversationEffort ?? preferred) ??
    getAssistantModel(modelId)?.reasoningEffort ??
    "medium"
  );
}
