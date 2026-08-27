import { describe, expect, it } from "vitest";
import {
  isSubmitLockHolding,
  omitSubmitLock,
  type SubmitLock,
  shouldClearComposerAfterSubmit,
  shouldClearSubmitLockOnError,
  shouldReleaseAwaitingTurn,
} from "./submit-lock";

function syncLock(overrides: Partial<SubmitLock> = {}): SubmitLock {
  return { kind: "sync", messageId: "m1", submittedUpdatedAt: 10, ...overrides };
}

describe("shouldReleaseAwaitingTurn", () => {
  it("releases once the turn is no longer idle, or idle with a newer updatedAt", () => {
    expect(shouldReleaseAwaitingTurn({ turnStatus: "running", updatedAt: 1, submittedUpdatedAt: 1 })).toBe(true);
    expect(shouldReleaseAwaitingTurn({ turnStatus: "error", updatedAt: 1, submittedUpdatedAt: 1 })).toBe(true);
    expect(shouldReleaseAwaitingTurn({ turnStatus: "idle", updatedAt: 2, submittedUpdatedAt: 1 })).toBe(true);
    expect(shouldReleaseAwaitingTurn({ turnStatus: "idle", updatedAt: 1, submittedUpdatedAt: 1 })).toBe(false);
  });
});

describe("isSubmitLockHolding", () => {
  const idle = { turnStatus: "idle" as const, updatedAt: 10 };

  it("does not hold without a lock", () => {
    expect(isSubmitLockHolding({ lock: undefined, conversation: idle, hasMessage: true })).toBe(false);
  });

  it("holds until the submitted user message is visible", () => {
    const lock = syncLock();
    expect(isSubmitLockHolding({ lock, conversation: idle, hasMessage: false })).toBe(true);
    expect(
      isSubmitLockHolding({ lock, conversation: { turnStatus: "running", updatedAt: 10 }, hasMessage: false }),
    ).toBe(true);
    expect(isSubmitLockHolding({ lock, conversation: null, hasMessage: false })).toBe(true);
  });

  it("holds a first send after the message lands until the conversation row exists", () => {
    const lock = syncLock({ submittedUpdatedAt: null });
    expect(isSubmitLockHolding({ lock, conversation: null, hasMessage: true })).toBe(true);
    expect(isSubmitLockHolding({ lock, conversation: idle, hasMessage: true })).toBe(false);
    expect(isSubmitLockHolding({ lock, conversation: { turnStatus: "running", updatedAt: 1 }, hasMessage: true })).toBe(
      false,
    );
  });

  it("holds a follow-up until running or a newer idle write", () => {
    const lock = syncLock({ submittedUpdatedAt: 10 });
    expect(isSubmitLockHolding({ lock, conversation: null, hasMessage: true })).toBe(true);
    expect(isSubmitLockHolding({ lock, conversation: idle, hasMessage: true })).toBe(true);
    expect(
      isSubmitLockHolding({ lock, conversation: { turnStatus: "running", updatedAt: 10 }, hasMessage: true }),
    ).toBe(false);
    expect(isSubmitLockHolding({ lock, conversation: { turnStatus: "idle", updatedAt: 11 }, hasMessage: true })).toBe(
      false,
    );
  });
});

describe("shouldClearComposerAfterSubmit", () => {
  it("clears when still on that chat, including first-load null active id", () => {
    expect(shouldClearComposerAfterSubmit({ submittedConversationId: "a", activeConversationId: "a" })).toBe(true);
    expect(shouldClearComposerAfterSubmit({ submittedConversationId: "a", activeConversationId: null })).toBe(true);
    expect(shouldClearComposerAfterSubmit({ submittedConversationId: "a", activeConversationId: "b" })).toBe(false);
  });
});

describe("shouldClearSubmitLockOnError", () => {
  it("only clears the lock object this invocation set", () => {
    const owned = syncLock();
    expect(shouldClearSubmitLockOnError({ current: owned, owned })).toBe(true);
    expect(shouldClearSubmitLockOnError({ current: syncLock({ messageId: "other" }), owned })).toBe(false);
    expect(shouldClearSubmitLockOnError({ current: undefined, owned })).toBe(false);
  });
});

describe("omitSubmitLock", () => {
  it("returns the same object when the id is absent", () => {
    const locks = { a: syncLock() };
    expect(omitSubmitLock(locks, "b")).toBe(locks);
  });

  it("drops the id without mutating the original", () => {
    const locks = { a: syncLock(), b: syncLock({ messageId: "m2" }) };
    expect(omitSubmitLock(locks, "a")).toEqual({ b: locks.b });
    expect(locks).toHaveProperty("a");
  });
});
