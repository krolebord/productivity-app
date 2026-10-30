import { getAssistantModel } from "./models";

export type ConversationUsageRow = {
  tombstone?: boolean;
  model: string | null;
  totalCost: number;
  totalTokens: number;
};

export type UsageScope = "live" | "all";

export type ModelUsageRow = { model: string | null; conversations: number; cost: number };

export type AssistantUsageSummary = {
  conversations: number;
  totalCost: number;
  totalTokens: number;
  averageCost: number;
  /** Per model, most expensive first. Retired aliases fold into their catalog model. */
  models: ModelUsageRow[];
};

/** Spend across conversations: "live" skips deleted ones, "all" covers all-time usage. */
export function summarizeAssistantUsage(rows: readonly ConversationUsageRow[], scope: UsageScope) {
  const scoped = scope === "live" ? rows.filter((row) => !row.tombstone) : rows;
  const totalCost = scoped.reduce((sum, row) => sum + row.totalCost, 0);
  const totalTokens = scoped.reduce((sum, row) => sum + row.totalTokens, 0);

  const byModel = new Map<string, ModelUsageRow>();
  for (const row of scoped) {
    const model = row.model ? (getAssistantModel(row.model)?.id ?? row.model) : null;
    const key = model ?? "__none";
    const current = byModel.get(key) ?? { model, conversations: 0, cost: 0 };
    byModel.set(key, { model, conversations: current.conversations + 1, cost: current.cost + row.totalCost });
  }

  return {
    conversations: scoped.length,
    totalCost,
    totalTokens,
    averageCost: scoped.length > 0 ? totalCost / scoped.length : 0,
    models: [...byModel.values()].sort((a, b) => b.cost - a.cost || b.conversations - a.conversations),
  } satisfies AssistantUsageSummary;
}

export function usageModelLabel(modelId: string | null) {
  if (!modelId) return "No model";
  return getAssistantModel(modelId)?.label ?? modelId;
}
