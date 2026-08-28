import { useCallback, useEffect } from "react";
import { useAssistantStore } from "@/lib/assistant-store";
import { conversationLastReadCatchUp, viewingConversationId } from "@/lib/conversation-list";
import { useDb } from "@/user-db/user-db";

/** Stamp lastReadAt to updatedAt when the row is behind. No-ops on missing drafts. */
export function useCatchUpConversationLastReadAt() {
  const { db } = useDb();

  return useCallback(
    (id: string | null) => {
      if (id == null) return;
      const { rows } = db.executeKysely((q) =>
        q.selectFrom("conversation").select(["updatedAt", "lastReadAt"]).where("id", "=", id).limit(1),
      );
      const lastReadAt = conversationLastReadCatchUp(rows[0]);
      if (lastReadAt == null) return;
      db.executeKysely((q) => q.updateTable("conversation").set({ lastReadAt }).where("id", "=", id));
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
