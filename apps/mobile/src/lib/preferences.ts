import {
  type AssistantModelId,
  type AssistantReasoningEffort,
  DEFAULT_ASSISTANT_MODEL,
  isAssistantReasoningEffort,
  resolveSelectableAssistantModelId,
} from "@productivity/core/agent/models";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Uniwind } from "uniwind";

export type ThemePreference = "system" | "light" | "dark";
export type DefaultHome = "today" | "finances";

/**
 * Device-only preferences, as the web keeps theme and default home in localStorage rather than the
 * synced DB. Stored in SecureStore because it's the only persistent store the app ships, and its
 * synchronous read lets the theme apply before the first frame.
 */
type Preferences = {
  theme: ThemePreference;
  defaultHome: DefaultHome;
  /** The saved→device timezone pair the user chose to keep, so it isn't offered again. */
  dismissedTimeZoneMismatch: string;
  /** Model and effort for new chats, as the web's assistant store keeps them; null effort = catalog default. */
  assistantModel: AssistantModelId;
  assistantReasoningEffort: AssistantReasoningEffort | null;
  /** The chat the assistant reopens on, which may be an unsent draft's id. */
  assistantConversationId: string | null;
};

const STORAGE_KEY = "preferences";

const DEFAULTS: Preferences = {
  theme: "system",
  defaultHome: "today",
  dismissedTimeZoneMismatch: "",
  assistantModel: DEFAULT_ASSISTANT_MODEL,
  assistantReasoningEffort: null,
  assistantConversationId: null,
};

function read(): Preferences {
  try {
    const raw = SecureStore.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : "system",
      defaultHome: parsed.defaultHome === "finances" ? "finances" : "today",
      dismissedTimeZoneMismatch:
        typeof parsed.dismissedTimeZoneMismatch === "string" ? parsed.dismissedTimeZoneMismatch : "",
      assistantModel: resolveSelectableAssistantModelId(parsed.assistantModel),
      assistantReasoningEffort: isAssistantReasoningEffort(parsed.assistantReasoningEffort)
        ? parsed.assistantReasoningEffort
        : null,
      assistantConversationId:
        typeof parsed.assistantConversationId === "string" && parsed.assistantConversationId
          ? parsed.assistantConversationId
          : null,
    };
  } catch {
    return DEFAULTS;
  }
}

let preferences = read();
const listeners = new Set<() => void>();

Uniwind.setTheme(preferences.theme);

export function getPreferences(): Preferences {
  return preferences;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  if (preferences[key] === value) return;
  preferences = { ...preferences, [key]: value };
  if (key === "theme") Uniwind.setTheme(value as ThemePreference);
  try {
    SecureStore.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Still applies for this session; it just won't survive a restart.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreference<K extends keyof Preferences>(key: K): Preferences[K] {
  return useSyncExternalStore(subscribe, () => preferences[key]);
}
