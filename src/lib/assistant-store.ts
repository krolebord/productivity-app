import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AssistantStore {
  open: boolean;
  activeConversationId: string | null;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveConversation: (id: string | null) => void;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      activeConversationId: null,
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
    }),
    { name: "productivity-assistant" },
  ),
);
