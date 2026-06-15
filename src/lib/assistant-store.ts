import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AssistantModelId, DEFAULT_ASSISTANT_MODEL, resolveAssistantModelId } from "@/agent/models";

interface AssistantStore {
  open: boolean;
  activeConversationId: string | null;
  model: AssistantModelId;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveConversation: (id: string | null) => void;
  setModel: (model: AssistantModelId) => void;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      activeConversationId: null,
      model: DEFAULT_ASSISTANT_MODEL,
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      setModel: (model) => set({ model }),
    }),
    {
      name: "productivity-assistant",
      // Guard against a persisted id that's no longer in the supported list.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<AssistantStore>) };
        return { ...state, model: resolveAssistantModelId(state.model) };
      },
    },
  ),
);
