import { useCallback, useSyncExternalStore } from "react";
import { useAssistantStore } from "./assistant-store";
import { useAssistantSurface } from "./use-assistant-surface";

/**
 * A row the user can pull into the assistant as context. `table` is the synced
 * SQLite view the assistant queries (see src/user-db/migrations.ts) — note that
 * notes live in `item`, not a `note` table.
 */
export type AttachRef = {
  table: "item" | "account" | "transaction_entry";
  id: string;
};

function formatAttachToken(ref: AttachRef): string {
  return `@${ref.table}:${ref.id}`;
}

let isHeld = false;
const subscribers = new Set<() => void>();

function emit() {
  for (const notify of subscribers) notify();
}

function syncFromEvent(e: KeyboardEvent | MouseEvent) {
  const held = e.metaKey || e.ctrlKey;
  if (held !== isHeld) {
    isHeld = held;
    emit();
  }
}

function reset() {
  if (isHeld) {
    isHeld = false;
    emit();
  }
}

function subscribe(notify: () => void): () => void {
  if (subscribers.size === 0 && typeof window !== "undefined") {
    window.addEventListener("keydown", syncFromEvent);
    window.addEventListener("keyup", syncFromEvent);
    // The keyup can be missed when focus leaves the window (e.g. Cmd+Tab), so
    // reset on blur to avoid getting stuck in the "held" state.
    window.addEventListener("blur", reset);
  }
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("keydown", syncFromEvent);
      window.removeEventListener("keyup", syncFromEvent);
      window.removeEventListener("blur", reset);
      isHeld = false;
    }
  };
}

function getSnapshot(): boolean {
  return isHeld;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useAttachToAssistant() {
  const isContextKeyHeld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const appendToInput = useAssistantStore((s) => s.appendToInput);
  const { open: openAssistant } = useAssistantSurface();
  const requestComposerFocus = useAssistantStore((s) => s.requestComposerFocus);

  const attach = useCallback(
    (ref: AttachRef) => {
      appendToInput(formatAttachToken(ref));
      openAssistant();
      requestComposerFocus();
    },
    [appendToInput, openAssistant, requestComposerFocus],
  );

  const getAttachClickHandler = useCallback(
    (ref: AttachRef) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      attach(ref);
    },
    [attach],
  );

  return { isContextKeyHeld, attach, getAttachClickHandler };
}
