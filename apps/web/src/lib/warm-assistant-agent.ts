import { orpc } from "@/orpc/orpc-client";

const AGENT_WARM_INTERVAL_MS = 60_000;
const lastWarmAt = new Map<string, number>();

/**
 * Wakes a conversation's agent so its cold start overlaps composing instead of delaying the
 * submit. Drafts benefit most, since their first call creates the agent's Durable Object.
 */
export function warmAssistantAgent(conversationId: string) {
  const now = Date.now();
  if (now - (lastWarmAt.get(conversationId) ?? 0) < AGENT_WARM_INTERVAL_MS) return;
  lastWarmAt.set(conversationId, now);
  orpc.assistant.ensureProjection.call({ conversationId }).catch(() => {
    lastWarmAt.delete(conversationId);
  });
}
