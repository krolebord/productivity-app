import { useEffect } from "react";
import { useAssistantStore } from "@/lib/assistant-store";
import { isSubmitLockHolding } from "@/lib/submit-lock";
import { useCatchUpConversationLastReadOnVisibility } from "@/lib/use-catch-up-conversation-last-read";
import { useDbQuery } from "@/user-db/user-db";

/** Stamps the open thread when the tab is hidden or shown. */
export function ConversationLastReadVisibilityWatcher() {
  useCatchUpConversationLastReadOnVisibility();
  return null;
}

/** Drops submit locks once the user message and turn status have caught up, even if that chat is not open. */
export function SubmitLockWatcher() {
  const { data: conversations } = useDbQuery((db) =>
    db.selectFrom("conversation").select(["id", "turnStatus", "updatedAt"]),
  );
  const { data: messages } = useDbQuery((db) => db.selectFrom("conversation_message").select(["id"]));
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
