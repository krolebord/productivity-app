/**
 * Widget colors: the tokens in src/global.css as hex (widgets can't read CSS variables), plus the
 * finance tones from lib/finance.ts. The iOS layouts repeat these inline, since their functions are
 * serialized and can't see module values; keep the three in sync.
 */
export type WidgetPalette = {
  background: `#${string}`;
  foreground: `#${string}`;
  muted: `#${string}`;
  mutedForeground: `#${string}`;
  border: `#${string}`;
  primary: `#${string}`;
  primaryForeground: `#${string}`;
  destructive: `#${string}`;
  income: `#${string}`;
  expense: `#${string}`;
};

export const LIGHT_PALETTE: WidgetPalette = {
  background: "#ffffff",
  foreground: "#333333",
  muted: "#f9fafb",
  mutedForeground: "#6b7280",
  border: "#e5e7eb",
  primary: "#8b5cf6",
  primaryForeground: "#ffffff",
  destructive: "#ef4444",
  income: "#059669", // emerald-600
  expense: "#e11d48", // rose-600
};

export const DARK_PALETTE: WidgetPalette = {
  background: "#171717",
  foreground: "#e5e5e5",
  muted: "#262626", // card: a step up from the background reads better than muted at widget size
  mutedForeground: "#a3a3a3",
  border: "#404040",
  primary: "#8b5cf6",
  primaryForeground: "#ffffff",
  destructive: "#ef4444",
  income: "#34d399", // emerald-400
  expense: "#fb7185", // rose-400
};
