import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DefaultHome = "finances" | "today";

interface DefaultHomeStore {
  defaultHome: DefaultHome;
  setDefaultHome: (defaultHome: DefaultHome) => void;
}

const STORAGE_KEY = "productivity-default-home";

export const useDefaultHomeStore = create<DefaultHomeStore>()(
  persist(
    (set) => ({
      defaultHome: "finances",
      setDefaultHome: (defaultHome) => set({ defaultHome }),
    }),
    { name: STORAGE_KEY },
  ),
);

/** Sync read for route redirects (avoids waiting on zustand rehydrate). */
export function resolveDefaultHome(): DefaultHome {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "finances";
    const parsed = JSON.parse(raw) as { state?: { defaultHome?: unknown } };
    const value = parsed.state?.defaultHome;
    // "money" was the brief interim key before rename to finances.
    if (value === "today" || value === "finances" || value === "money") {
      return value === "today" ? "today" : "finances";
    }
  } catch {
    // ignore corrupt storage
  }
  return "finances";
}

export function defaultHomePath(home: DefaultHome = resolveDefaultHome()): "/finances" | "/today" {
  return home === "today" ? "/today" : "/finances";
}
