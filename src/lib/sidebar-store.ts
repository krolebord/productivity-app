import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarStore {
  collapsed: boolean;
  toggle: () => void;
  groups: Record<string, boolean>;
  setGroupOpen: (group: string, open: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      groups: {},
      setGroupOpen: (group, open) => set((s) => ({ groups: { ...s.groups, [group]: open } })),
    }),
    { name: "productivity-sidebar" },
  ),
);
