import type { ConversationItem } from "../user-db/migrations";

const AGENT_WARM_INTERVAL_MS = 60_000;

/**
 * Wakes a conversation's agent so its cold start overlaps composing instead of delaying the
 * submit. Drafts benefit most, since their first call creates the agent's Durable Object.
 * Throttled per conversation; a failed call doesn't count, so the next keystroke retries.
 */
export function createAgentWarmer(
  ensure: (conversationId: string) => Promise<unknown>,
  options: { intervalMs?: number; now?: () => number } = {},
) {
  const intervalMs = options.intervalMs ?? AGENT_WARM_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const lastWarmAt = new Map<string, number>();

  return (conversationId: string) => {
    const at = now();
    const last = lastWarmAt.get(conversationId);
    if (last !== undefined && at - last < intervalMs) return;
    lastWarmAt.set(conversationId, at);
    ensure(conversationId).catch(() => {
      if (lastWarmAt.get(conversationId) === at) lastWarmAt.delete(conversationId);
    });
  };
}

/**
 * Opening a chat doesn't wake the agent, so a conversation whose transcript predates the
 * synced `conversation_message` table shows empty until something does. Brand-new chats
 * (no title, no usage yet) have nothing to backfill.
 */
export function needsTranscriptBackfill(
  conversation: Pick<ConversationItem, "title" | "totalTokens"> | null | undefined,
  messageCount: number,
): boolean {
  if (!conversation || messageCount > 0) return false;
  return !!conversation.title || conversation.totalTokens > 0;
}
