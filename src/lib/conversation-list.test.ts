import { describe, expect, it } from "vitest";
import { DEFAULT_ASSISTANT_MODEL, getAssistantModel } from "@/agent/models";
import { localMidnightMs } from "@/lib/date-time";
import {
  type ConversationListItem,
  conversationActivityLabel,
  conversationModelLabel,
  conversationTitle,
  groupConversations,
  shouldRecordUnseenCompletion,
  summarizeConversationActivity,
  unseenCompletionFromTransition,
} from "./conversation-list";

function item(overrides: Partial<ConversationListItem> & Pick<ConversationListItem, "id">): ConversationListItem {
  return {
    title: "",
    updatedAt: 0,
    turnStatus: "idle",
    model: null,
    totalCost: 0,
    totalTokens: 0,
    ...overrides,
  };
}

describe("conversationTitle", () => {
  it("falls back when the title is empty", () => {
    expect(conversationTitle({ title: "" })).toBe("New conversation");
    expect(conversationTitle({ title: "Budget Q3" })).toBe("Budget Q3");
  });
});

describe("conversationModelLabel", () => {
  it("returns the catalog label and omits unknown models", () => {
    expect(conversationModelLabel(DEFAULT_ASSISTANT_MODEL)).toBe(getAssistantModel(DEFAULT_ASSISTANT_MODEL)?.label);
    expect(conversationModelLabel("retired/old-model")).toBeNull();
    expect(conversationModelLabel(null)).toBeNull();
  });
});

describe("groupConversations", () => {
  const nowMs = new Date(2026, 7, 26, 15, 0, 0).getTime();
  const todayStart = localMidnightMs(new Date(nowMs));

  it("puts running chats first, then today, then older, omitting empty sections", () => {
    const conversations = [
      item({ id: "run-new", title: "Live", turnStatus: "running", updatedAt: todayStart + 2 }),
      item({ id: "today", title: "Today", turnStatus: "idle", updatedAt: todayStart + 1 }),
      item({ id: "run-old", title: "Still going", turnStatus: "running", updatedAt: todayStart - 5_000 }),
      item({ id: "older", title: "Yesterday", turnStatus: "error", updatedAt: todayStart - 1 }),
    ];

    expect(groupConversations({ conversations, nowMs })).toEqual([
      { kind: "running", conversations: [conversations[0], conversations[2]] },
      { kind: "today", conversations: [conversations[1]] },
      { kind: "older", conversations: [conversations[3]] },
    ]);
  });

  it("treats midnight as today", () => {
    const onMidnight = item({ id: "edge", updatedAt: todayStart, turnStatus: "idle" });
    expect(groupConversations({ conversations: [onMidnight], nowMs })).toEqual([
      { kind: "today", conversations: [onMidnight] },
    ]);
  });

  it("returns no sections for an empty list", () => {
    expect(groupConversations({ conversations: [], nowMs })).toEqual([]);
  });
});

describe("unseenCompletionFromTransition", () => {
  it("records idle and error only after running", () => {
    expect(unseenCompletionFromTransition("running", "idle")).toBe("idle");
    expect(unseenCompletionFromTransition("running", "error")).toBe("error");
    expect(unseenCompletionFromTransition(undefined, "idle")).toBeNull();
    expect(unseenCompletionFromTransition("idle", "error")).toBeNull();
    expect(unseenCompletionFromTransition("running", "running")).toBeNull();
  });
});

describe("shouldRecordUnseenCompletion", () => {
  const base = {
    conversationId: "b",
    activePanel: "assistant" as const,
    showConversationList: false,
    activeConversationId: "a",
  };

  it("skips the chat the user is looking at and the list", () => {
    expect(shouldRecordUnseenCompletion({ ...base, conversationId: "a" })).toBe(false);
    expect(shouldRecordUnseenCompletion({ ...base, showConversationList: true })).toBe(false);
  });

  it("records when the panel is closed, on Today, or another chat is open", () => {
    expect(shouldRecordUnseenCompletion({ ...base, activePanel: null })).toBe(true);
    expect(shouldRecordUnseenCompletion({ ...base, activePanel: "today" })).toBe(true);
    expect(shouldRecordUnseenCompletion(base)).toBe(true);
  });
});

describe("summarizeConversationActivity", () => {
  const conversations = [
    item({ id: "a", turnStatus: "idle" }),
    item({ id: "b", turnStatus: "running" }),
    item({ id: "c", turnStatus: "running" }),
    item({ id: "d", turnStatus: "error" }),
    item({ id: "e", turnStatus: "idle" }),
  ];

  it("counts other running chats and unseen completions, ignoring the active chat", () => {
    expect(
      summarizeConversationActivity({
        conversations,
        activeConversationId: "a",
        unseenCompletions: { a: "idle", d: "error", e: "idle" },
      }),
    ).toEqual({ otherRunningCount: 2, unseenFinishedCount: 1, unseenFailedCount: 1 });
  });

  it("does not count the active chat as running for the back control", () => {
    expect(
      summarizeConversationActivity({
        conversations,
        activeConversationId: "b",
        unseenCompletions: {},
      }),
    ).toEqual({ otherRunningCount: 1, unseenFinishedCount: 0, unseenFailedCount: 0 });
  });

  it("ignores unseen completions for chats that no longer exist", () => {
    expect(
      summarizeConversationActivity({
        conversations,
        activeConversationId: "a",
        unseenCompletions: { gone: "idle", missing: "error" },
      }),
    ).toEqual({ otherRunningCount: 2, unseenFinishedCount: 0, unseenFailedCount: 0 });
  });
});

describe("conversationActivityLabel", () => {
  it("returns null when nothing is happening", () => {
    expect(
      conversationActivityLabel({ otherRunningCount: 0, unseenFinishedCount: 0, unseenFailedCount: 0 }),
    ).toBeNull();
  });

  it("joins running, finished, and failed in that order", () => {
    expect(conversationActivityLabel({ otherRunningCount: 2, unseenFinishedCount: 1, unseenFailedCount: 1 })).toBe(
      "2 chats running, 1 chat finished, 1 chat failed",
    );
  });
});
