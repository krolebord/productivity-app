import { describe, expect, it } from "vitest";
import { localMidnightMs } from "@/lib/date-time";
import {
  type ConversationListItem,
  conversationActivityLabel,
  conversationRowStatus,
  conversationTimeLabel,
  conversationTitle,
  groupConversations,
  shouldRecordUnseenCompletion,
  summarizeConversationActivity,
  turnElapsedLabel,
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

describe("groupConversations", () => {
  const nowMs = new Date(2026, 7, 26, 15, 0, 0).getTime();
  const todayStart = localMidnightMs(new Date(nowMs));
  const yesterdayStart = new Date(2026, 7, 25).getTime();
  const monthStart = new Date(2026, 7, 1).getTime();

  it("orders running, unread, then the time buckets, omitting empty sections", () => {
    const conversations = [
      item({ id: "run-new", turnStatus: "running", updatedAt: todayStart + 2 }),
      item({ id: "today", turnStatus: "idle", updatedAt: todayStart + 1 }),
      item({ id: "run-old", turnStatus: "running", updatedAt: todayStart - 5_000 }),
      item({ id: "unread", turnStatus: "idle", updatedAt: todayStart - 1 }),
      item({ id: "yesterday", turnStatus: "error", updatedAt: yesterdayStart }),
      item({ id: "month", turnStatus: "idle", updatedAt: monthStart }),
      item({ id: "older", turnStatus: "idle", updatedAt: monthStart - 1 }),
    ];

    expect(groupConversations({ conversations, nowMs, unseenCompletions: { unread: "idle" } })).toEqual([
      { kind: "running", conversations: [conversations[0], conversations[2]] },
      { kind: "unread", conversations: [conversations[3]] },
      { kind: "today", conversations: [conversations[1]] },
      { kind: "yesterday", conversations: [conversations[4]] },
      { kind: "month", conversations: [conversations[5]] },
      { kind: "older", conversations: [conversations[6]] },
    ]);
  });

  it("keeps a running chat out of unread", () => {
    const running = item({ id: "a", turnStatus: "running", updatedAt: todayStart });
    expect(groupConversations({ conversations: [running], nowMs, unseenCompletions: { a: "error" } })).toEqual([
      { kind: "running", conversations: [running] },
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

describe("conversationRowStatus", () => {
  it("prefers the synced turn status over the local unread marker", () => {
    const status = (
      conversation: Parameters<typeof conversationRowStatus>[0]["conversation"],
      unseenCompletions: Parameters<typeof conversationRowStatus>[0]["unseenCompletions"] = {},
    ) => conversationRowStatus({ conversation, unseenCompletions });

    expect(status({ id: "a", turnStatus: "running" }, { a: "idle" })).toBe("running");
    expect(status({ id: "a", turnStatus: "error" })).toBe("error");
    expect(status({ id: "a", turnStatus: "idle" }, { a: "error" })).toBe("error");
    expect(status({ id: "a", turnStatus: "idle" }, { a: "idle" })).toBe("unread");
    expect(status({ id: "a", turnStatus: "idle" })).toBe("idle");
  });
});

describe("conversationTimeLabel", () => {
  const nowMs = new Date(2026, 7, 26, 15, 0, 0).getTime();

  it("counts minutes and hours inside today", () => {
    expect(conversationTimeLabel({ timestamp: nowMs - 20_000, nowMs })).toBe("now");
    expect(conversationTimeLabel({ timestamp: nowMs - 4 * 60_000, nowMs })).toBe("4m");
    expect(conversationTimeLabel({ timestamp: nowMs - 2 * 3_600_000, nowMs })).toBe("2h");
  });

  it("switches to a clock yesterday and a date before that", () => {
    expect(conversationTimeLabel({ timestamp: new Date(2026, 7, 25, 18, 40).getTime(), nowMs })).toBe("18:40");
    expect(conversationTimeLabel({ timestamp: new Date(2026, 7, 21, 16, 5).getTime(), nowMs })).toBe("21 Aug");
    expect(conversationTimeLabel({ timestamp: new Date(2025, 10, 3, 9, 0).getTime(), nowMs })).toBe("3 Nov 25");
  });
});

describe("turnElapsedLabel", () => {
  it("formats minutes, and hours once the turn passes one", () => {
    const nowMs = 3_600_000;
    expect(turnElapsedLabel({ startedAt: nowMs - 24_000, nowMs })).toBe("0:24");
    expect(turnElapsedLabel({ startedAt: nowMs - 72_000, nowMs })).toBe("1:12");
    expect(turnElapsedLabel({ startedAt: nowMs - 3_849_000, nowMs })).toBe("1:04:09");
    expect(turnElapsedLabel({ startedAt: nowMs + 5_000, nowMs })).toBe("0:00");
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

  it("skips only the chat the user has open", () => {
    expect(shouldRecordUnseenCompletion({ ...base, conversationId: "a" })).toBe(false);
  });

  it("records when the panel is closed, on Today, on the list, or another chat is open", () => {
    expect(shouldRecordUnseenCompletion({ ...base, activePanel: null })).toBe(true);
    expect(shouldRecordUnseenCompletion({ ...base, activePanel: "today" })).toBe(true);
    expect(shouldRecordUnseenCompletion({ ...base, showConversationList: true })).toBe(true);
    expect(shouldRecordUnseenCompletion(base)).toBe(true);
  });

  it("still records a chat finishing while its own chat is open behind the list", () => {
    expect(shouldRecordUnseenCompletion({ ...base, conversationId: "a", showConversationList: true })).toBe(true);
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
