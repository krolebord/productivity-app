import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMediaQuery } from "@/lib/use-media-query";

export type Theme = "light" | "dark" | "system";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const prefersDarkQuery = "(prefers-color-scheme: dark)";

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia(prefersDarkQuery).matches ? "dark" : "light";
  }
  return theme;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
}

/**
 * The persisted key/shape is also read by the inline script in index.html,
 * which applies the theme class before first paint — keep them in sync.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    { name: "productivity-theme" },
  ),
);

/** The theme actually in effect, with "system" resolved. Reactive to OS changes. */
export function useResolvedTheme(): "light" | "dark" {
  const theme = useThemeStore((s) => s.theme);
  const prefersDark = useMediaQuery(prefersDarkQuery);
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

useThemeStore.subscribe((s) => applyTheme(s.theme));

window.matchMedia(prefersDarkQuery).addEventListener("change", () => {
  applyTheme(useThemeStore.getState().theme);
});
