import type { SubmitLock } from "@productivity/core/submit-lock";
import { useSyncExternalStore } from "react";

type ChatState = { draft: string; lock?: SubmitLock };

const EMPTY: ChatState = { draft: "" };

/**
 * Composer state keyed by conversation id, outside the chat component, so switching
 * chats or leaving the screen keeps the draft and doesn't unlock an in-flight send
 * before its user message and turn status have synced. Not persisted.
 */
const chats = new Map<string, ChatState>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(id: string, change: (state: ChatState) => ChatState) {
  const current = getAssistantChat(id);
  const next = change(current);
  if (next === current) return;
  if (!next.draft && !next.lock) chats.delete(id);
  else chats.set(id, next);
  for (const listener of listeners) listener();
}

/** Reads the latest state synchronously, so a second tap before re-render still sees the lock. */
export function getAssistantChat(id: string): ChatState {
  return chats.get(id) ?? EMPTY;
}

export function useAssistantChat(id: string): ChatState {
  return useSyncExternalStore(subscribe, () => getAssistantChat(id));
}

export function setAssistantDraft(id: string, draft: string | ((current: string) => string)) {
  update(id, (state) => {
    const next = typeof draft === "function" ? draft(state.draft) : draft;
    return next === state.draft ? state : { ...state, draft: next };
  });
}

export function setAssistantSubmitLock(id: string, lock: SubmitLock) {
  update(id, (state) => ({ ...state, lock }));
}

/** Pass `owned` to clear only that lock, so a late failure can't drop a newer send's lock. */
export function clearAssistantSubmitLock(id: string, owned?: SubmitLock) {
  update(id, (state) => (state.lock && (!owned || state.lock === owned) ? { draft: state.draft } : state));
}
