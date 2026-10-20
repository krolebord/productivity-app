export type SubmitLock = {
  kind: "sync";
  messageId: string;
  submittedUpdatedAt: number | null;
};

export type SubmitLockConversation = {
  turnStatus: "idle" | "running" | "error";
  updatedAt: number;
};

export function shouldReleaseAwaitingTurn(input: {
  turnStatus: SubmitLockConversation["turnStatus"];
  updatedAt: number;
  submittedUpdatedAt: number;
}): boolean {
  if (input.turnStatus !== "idle") return true;
  return input.updatedAt !== input.submittedUpdatedAt;
}

/**
 * Composer stays locked until this submit's user row is visible, then until the
 * conversation turn has moved past the pre-submit snapshot (or any status, for a
 * first send that had no row yet).
 */
export function isSubmitLockHolding(input: {
  lock: SubmitLock | undefined;
  conversation: SubmitLockConversation | null;
  hasMessage: boolean;
}): boolean {
  if (!input.lock) return false;
  if (!input.hasMessage) return true;
  if (input.conversation == null) return true;
  if (input.lock.submittedUpdatedAt == null) return false;
  return !shouldReleaseAwaitingTurn({
    turnStatus: input.conversation.turnStatus,
    updatedAt: input.conversation.updatedAt,
    submittedUpdatedAt: input.lock.submittedUpdatedAt,
  });
}

export function shouldClearComposerAfterSubmit(input: {
  submittedConversationId: string;
  activeConversationId: string | null;
}): boolean {
  return input.activeConversationId === input.submittedConversationId || input.activeConversationId == null;
}

/** Only the invocation that owns `current` may clear it — a racing error must not drop a later lock. */
export function shouldClearSubmitLockOnError(input: { current: SubmitLock | undefined; owned: SubmitLock }): boolean {
  return input.current === input.owned;
}

export function omitSubmitLock(submitLocks: Record<string, SubmitLock>, id: string): Record<string, SubmitLock> {
  if (!(id in submitLocks)) return submitLocks;
  const next = { ...submitLocks };
  delete next[id];
  return next;
}
