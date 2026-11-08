import { type AttachRef, appendToDraft, formatAttachToken } from "@productivity/core/agent/attach";
import { isConversationUnread } from "@productivity/core/conversation-list";
import type { SubmitLock } from "@productivity/core/submit-lock";
import type { ConversationItem } from "@productivity/core/user-db/migrations";
import { generateId } from "@sqlite-sync/core";
import { useSyncExternalStore } from "react";
import type { PickedFile } from "./assistant-uploads";
import { getPreferences, setPreference } from "./preferences";

type ChatState = { draft: string; files: readonly PickedFile[]; lock?: SubmitLock };

const EMPTY: ChatState = { draft: "", files: [] };

/**
 * Composer state keyed by conversation id, outside the chat component, so switching
 * chats or leaving the screen keeps the draft and attachments and doesn't unlock an
 * in-flight send before its user message and turn status have synced. Not persisted.
 */
const chats = new Map<string, ChatState>();
const listeners = new Set<() => void>();

/**
 * A pending request for the composer to take focus, e.g. after attaching context. The nonce
 * re-renders a mounted composer; the flag lets one that mounts afterwards still pick it up once.
 */
let composerFocusNonce = 0;
let composerFocusRequested = false;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(id: string, change: (state: ChatState) => ChatState) {
  const current = getAssistantChat(id);
  const next = change(current);
  if (next === current) return;
  if (!next.draft && next.files.length === 0 && !next.lock) chats.delete(id);
  else chats.set(id, next);
  emit();
}

/** Reads the latest state synchronously, so a second tap before re-render still sees the lock. */
export function getAssistantChat(id: string): ChatState {
  return chats.get(id) ?? EMPTY;
}

export function useAssistantChat(id: string): ChatState {
  return useSyncExternalStore(subscribe, () => getAssistantChat(id));
}

export function useComposerFocusNonce() {
  return useSyncExternalStore(subscribe, () => composerFocusNonce);
}

/** True once per request, so only the composer that handles it takes focus. */
export function takeComposerFocusRequest() {
  const requested = composerFocusRequested;
  composerFocusRequested = false;
  return requested;
}

export function setAssistantDraft(id: string, draft: string | ((current: string) => string)) {
  update(id, (state) => {
    const next = typeof draft === "function" ? draft(state.draft) : draft;
    return next === state.draft ? state : { ...state, draft: next };
  });
}

export function setAssistantFiles(
  id: string,
  files: readonly PickedFile[] | ((current: readonly PickedFile[]) => readonly PickedFile[]),
) {
  update(id, (state) => ({ ...state, files: typeof files === "function" ? files(state.files) : files }));
}

/** Appends text to a chat's draft and asks its composer to take focus, like the web's skill starters. */
export function appendToAssistantDraft(id: string, text: string) {
  setAssistantDraft(id, (current) => appendToDraft(current, text));
  composerFocusRequested = true;
  composerFocusNonce += 1;
  emit();
}

export function setAssistantSubmitLock(id: string, lock: SubmitLock) {
  update(id, (state) => ({ ...state, lock }));
}

/** Pass `owned` to clear only that lock, so a late failure can't drop a newer send's lock. */
export function clearAssistantSubmitLock(id: string, owned?: SubmitLock) {
  update(id, (state) => (state.lock && (!owned || state.lock === owned) ? { ...state, lock: undefined } : state));
}

/** Drops everything held for a chat, e.g. once it's deleted. */
export function clearAssistantChat(id: string) {
  if (!chats.delete(id)) return;
  emit();
}

/**
 * Adds a `@table:id` token to the chat the assistant will open on, as the web's
 * Cmd-click does. With no remembered chat, starts a draft so the token has a home.
 */
export function attachToAssistant(ref: AttachRef) {
  let id = getPreferences().assistantConversationId;
  if (!id) {
    id = generateId();
    setPreference("assistantConversationId", id);
  }
  appendToAssistantDraft(id, formatAttachToken(ref));
}

// Opening the assistant starts a new chat unless the last one is still in play: touched or viewed
// within this window, running, with an unread reply, or holding a draft (e.g. context just attached).
const REOPEN_WITHIN_MS = 30 * 60_000;

// When a chat was last left. In memory only: after a restart only the chat's own updatedAt counts.
let lastViewed: { id: string; at: number } | null = null;

/** Remembers the chat being left, for the reopen window. */
export function markAssistantChatLeft(id: string) {
  lastViewed = { id, at: Date.now() };
}

/** The chat the assistant button opens: the remembered one while it's still in play, else a new one. */
export function startConversationId(conversations: readonly ConversationItem[]) {
  const remembered = getPreferences().assistantConversationId;
  if (!remembered) return generateId();
  const row = conversations.find((conversation) => conversation.id === remembered);
  // Not started yet: already a fresh chat.
  if (!row) return remembered;
  const chat = getAssistantChat(remembered);
  const touchedAt = Math.max(row.updatedAt, lastViewed?.id === remembered ? lastViewed.at : 0);
  const inPlay =
    row.turnStatus === "running" ||
    isConversationUnread(row) ||
    Date.now() - touchedAt < REOPEN_WITHIN_MS ||
    !!chat.draft ||
    chat.files.length > 0 ||
    chat.lock != null;
  return inPlay ? remembered : generateId();
}
