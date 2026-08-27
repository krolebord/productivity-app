import { useEffect, useRef } from "react";
import { useAssistantStore } from "@/lib/assistant-store";
import {
  type ConversationTurnStatus,
  shouldRecordUnseenCompletion,
  unseenCompletionFromTransition,
} from "@/lib/conversation-list";
import { isSubmitLockHolding } from "@/lib/submit-lock";
import { useDbQuery } from "@/user-db/user-db";

/** Watches conversation turns while the assistant panel is closed or on another chat. */
export function ConversationActivityWatcher() {
  const { data: conversations } = useDbQuery((db) => db.selectFrom("conversation").select(["id", "turnStatus"]));
  const prevStatuses = useRef(new Map<string, ConversationTurnStatus>());
  const initialized = useRef(false);
  const markUnseenCompletion = useAssistantStore((s) => s.markUnseenCompletion);
  const activePanel = useAssistantStore((s) => s.activePanel);
  const showConversationList = useAssistantStore((s) => s.showConversationList);
  const activeConversationId = useAssistantStore((s) => s.activeConversationId);

  useEffect(() => {
    const previous = prevStatuses.current;
    const next = new Map<string, ConversationTurnStatus>();

    for (const conversation of conversations) {
      next.set(conversation.id, conversation.turnStatus);
      if (!initialized.current) continue;

      const completion = unseenCompletionFromTransition(previous.get(conversation.id), conversation.turnStatus);
      if (!completion) continue;
      if (
        !shouldRecordUnseenCompletion({
          conversationId: conversation.id,
          activePanel,
          showConversationList,
          activeConversationId,
        })
      ) {
        continue;
      }
      markUnseenCompletion(conversation.id, completion);
    }

    prevStatuses.current = next;
    initialized.current = true;
  }, [conversations, activePanel, showConversationList, activeConversationId, markUnseenCompletion]);

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
