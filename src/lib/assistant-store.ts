import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AssistantStore {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
    }),
    { name: "productivity-assistant" },
  ),
);
