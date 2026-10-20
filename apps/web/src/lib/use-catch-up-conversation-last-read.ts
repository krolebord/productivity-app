import { viewingConversationId } from "@productivity/core/conversation-list";
import { catchUpConversationLastRead } from "@productivity/core/data/conversations";
import { useDb } from "@productivity/core/user-db/db-context";
import { useCallback, useEffect } from "react";
import { useAssistantStore } from "@/lib/assistant-store";

export function useCatchUpConversationLastReadAt() {
  const { db } = useDb();

  return useCallback(
    (id: string | null) => {
      if (id == null) return;
      catchUpConversationLastRead(db, id);
    },
    [db],
  );
}

/** Hide is leave, show is arrive. No-ops when the list or another panel is up. */
export function useCatchUpConversationLastReadOnVisibility() {
  const catchUp = useCatchUpConversationLastReadAt();

  useEffect(() => {
    const onVisibilityChange = () => {
      catchUp(viewingConversationId(useAssistantStore.getState()));
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [catchUp]);
}
