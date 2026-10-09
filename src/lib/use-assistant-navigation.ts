import { generateId } from "@sqlite-sync/core";
import { useCallback } from "react";
import { type RightPanel, useAssistantStore } from "@/lib/assistant-store";
import { viewingConversationId } from "@/lib/conversation-list";
import { useCatchUpConversationLastReadAt } from "@/lib/use-catch-up-conversation-last-read";
import { warmAssistantAgent } from "@/lib/warm-assistant-agent";

/**
 * Store panel/chat moves plus lastReadAt catch-up on leave and arrive.
 * Raw store setters do not stamp receipts.
 */
export function useAssistantNavigation() {
  const catchUp = useCatchUpConversationLastReadAt();
  const storeOpenPanel = useAssistantStore((s) => s.openPanel);
  const storeClosePanel = useAssistantStore((s) => s.closePanel);
  const storeTogglePanel = useAssistantStore((s) => s.togglePanel);
  const storeOpenConversationList = useAssistantStore((s) => s.openConversationList);
  const storeOpenConversation = useAssistantStore((s) => s.openConversation);

  const openConversation = useCallback(
    (id: string) => {
      const prev = viewingConversationId(useAssistantStore.getState());
      if (prev != null && prev !== id) catchUp(prev);
      storeOpenConversation(id);
      catchUp(id);
    },
    [catchUp, storeOpenConversation],
  );

  const openNewConversation = useCallback(() => {
    const id = generateId();
    openConversation(id);
    warmAssistantAgent(id);
  }, [openConversation]);

  const openConversationList = useCallback(() => {
    catchUp(viewingConversationId(useAssistantStore.getState()));
    storeOpenConversationList();
  }, [catchUp, storeOpenConversationList]);

  const closePanel = useCallback(() => {
    catchUp(viewingConversationId(useAssistantStore.getState()));
    storeClosePanel();
  }, [catchUp, storeClosePanel]);

  const openPanel = useCallback(
    (panel: RightPanel) => {
      const state = useAssistantStore.getState();
      if (panel === "assistant") {
        catchUp(viewingConversationId(state));
        storeOpenPanel(panel);
        catchUp(useAssistantStore.getState().activeConversationId);
        return;
      }
      catchUp(viewingConversationId(state));
      storeOpenPanel(panel);
    },
    [catchUp, storeOpenPanel],
  );

  const togglePanel = useCallback(
    (panel: RightPanel) => {
      const state = useAssistantStore.getState();
      const closing = state.activePanel === panel;
      catchUp(viewingConversationId(state));
      storeTogglePanel(panel);
      if (panel === "assistant" && !closing) {
        catchUp(useAssistantStore.getState().activeConversationId);
      }
    },
    [catchUp, storeTogglePanel],
  );

  return { openConversation, openNewConversation, openConversationList, closePanel, openPanel, togglePanel };
}
