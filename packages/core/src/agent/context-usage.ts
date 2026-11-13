/** History size, in the session's token estimate, past which the agent summarizes older messages. */
export const CONTEXT_COMPACT_AFTER_TOKENS = 232_000;

/** How full the context is, 0–1, where 1 is the point older messages get summarized. */
export function contextUsageFraction(contextTokens: number): number {
  if (!Number.isFinite(contextTokens) || contextTokens <= 0) return 0;
  return Math.min(1, contextTokens / CONTEXT_COMPACT_AFTER_TOKENS);
}

function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens));
  return `${Math.round(tokens / 1000)}k`;
}

export function formatContextUsage(contextTokens: number): string {
  const percent = Math.round(contextUsageFraction(contextTokens) * 100);
  return `${percent}% of context used · ${formatTokenCount(contextTokens)} of ${formatTokenCount(CONTEXT_COMPACT_AFTER_TOKENS)} tokens`;
}
