import { useConversationMessageIds, useConversationTurnStatuses } from "@productivity/core/data/conversations";
import { isSubmitLockHolding } from "@productivity/core/submit-lock";
import { useEffect } from "react";
import { useAssistantStore } from "@/lib/assistant-store";
import { useCatchUpConversationLastReadOnVisibility } from "@/lib/use-catch-up-conversation-last-read";

/** Stamps the open thread when the tab is hidden or shown. */
export function ConversationLastReadVisibilityWatcher() {
  useCatchUpConversationLastReadOnVisibility();
  return null;
}

/** Drops submit locks once the user message and turn status have caught up, even if that chat is not open. */
export function SubmitLockWatcher() {
  const conversations = useConversationTurnStatuses();
  const messages = useConversationMessageIds();
  const submitLocks = useAssistantStore((s) => s.submitLocks);
  const clearSubmitLock = useAssistantStore((s) => s.clearSubmitLock);

  useEffect(() => {
    const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    const messageIds = new Set(messages.map((message) => message.id));

    for (const [id, lock] of Object.entries(submitLocks)) {
      const conversation = conversationById.get(id) ?? null;
      if (
        !isSubmitLockHolding({
          lock,
          conversation,
          hasMessage: messageIds.has(lock.messageId),
        })
      ) {
        clearSubmitLock(id);
      }
    }
  }, [conversations, messages, submitLocks, clearSubmitLock]);

  return null;
}
