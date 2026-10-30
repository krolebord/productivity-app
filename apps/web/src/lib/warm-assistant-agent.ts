import { createAgentWarmer } from "@productivity/core/agent/agent-warmer";
import { orpc } from "@/orpc/orpc-client";

/**
 * Wakes a conversation's agent so its cold start overlaps composing instead of delaying the
 * submit. Drafts benefit most, since their first call creates the agent's Durable Object.
 */
export const warmAssistantAgent = createAgentWarmer((conversationId) =>
  orpc.assistant.ensureProjection.call({ conversationId }),
);
