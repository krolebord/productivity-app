import { describe, expect, it } from "vitest";
import {
  type ConversationListItem,
  conversationActivityLabel,
  conversationLastReadCatchUp,
  conversationRowStatus,
  conversationTimeLabel,
  conversationTitle,
  groupConversations,
  isConversationUnread,
  summarizeConversationActivity,
  turnElapsedLabel,
  viewingConversationId,
} from "./conversation-list";
import { localMidnightMs } from "./date-time";

function item(overrides: Partial<ConversationListItem> & Pick<ConversationListItem, "id">): ConversationListItem {
  const updatedAt = overrides.updatedAt ?? 0;
  return {
    title: "",
    updatedAt,
    lastReadAt: overrides.lastReadAt !== undefined ? overrides.lastReadAt : updatedAt,
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
      item({ id: "unread", turnStatus: "idle", updatedAt: todayStart - 1, lastReadAt: todayStart - 2 }),
      item({ id: "yesterday", turnStatus: "error", updatedAt: yesterdayStart }),
      item({ id: "month", turnStatus: "idle", updatedAt: monthStart }),
      item({ id: "older", turnStatus: "idle", updatedAt: monthStart - 1 }),
    ];

    expect(groupConversations({ conversations, nowMs })).toEqual([
      { kind: "running", conversations: [conversations[0], conversations[2]] },
      { kind: "unread", conversations: [conversations[3]] },
      { kind: "today", conversations: [conversations[1]] },
      { kind: "yesterday", conversations: [conversations[4]] },
      { kind: "month", conversations: [conversations[5]] },
      { kind: "older", conversations: [conversations[6]] },
    ]);
  });

  it("does not put a chat with no receipt in unread", () => {
    const neverOpened = item({
      id: "legacy",
      turnStatus: "idle",
      updatedAt: todayStart - 1,
      lastReadAt: null,
    });
    expect(groupConversations({ conversations: [neverOpened], nowMs })).toEqual([
      { kind: "yesterday", conversations: [neverOpened] },
    ]);
  });

  it("keeps a running chat out of unread", () => {
    const running = item({ id: "a", turnStatus: "running", updatedAt: todayStart, lastReadAt: todayStart - 1 });
    expect(groupConversations({ conversations: [running], nowMs })).toEqual([
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

describe("isConversationUnread", () => {
  it("ignores running rows and rows with no receipt", () => {
    expect(isConversationUnread({ turnStatus: "running", updatedAt: 2, lastReadAt: 1 })).toBe(false);
    expect(isConversationUnread({ turnStatus: "idle", updatedAt: 2, lastReadAt: null })).toBe(false);
    expect(isConversationUnread({ turnStatus: "error", updatedAt: 2, lastReadAt: null })).toBe(false);
    expect(isConversationUnread({ turnStatus: "idle", updatedAt: 2, lastReadAt: 2 })).toBe(false);
    expect(isConversationUnread({ turnStatus: "idle", updatedAt: 2, lastReadAt: 1 })).toBe(true);
    expect(isConversationUnread({ turnStatus: "error", updatedAt: 2, lastReadAt: 1 })).toBe(true);
  });
});

describe("conversationRowStatus", () => {
  it("prefers the synced turn status over the lastReadAt receipt", () => {
    expect(conversationRowStatus({ turnStatus: "running", updatedAt: 2, lastReadAt: 1 })).toBe("running");
    expect(conversationRowStatus({ turnStatus: "error", updatedAt: 2, lastReadAt: 2 })).toBe("error");
    expect(conversationRowStatus({ turnStatus: "error", updatedAt: 2, lastReadAt: 1 })).toBe("error");
    expect(conversationRowStatus({ turnStatus: "idle", updatedAt: 2, lastReadAt: 1 })).toBe("unread");
    expect(conversationRowStatus({ turnStatus: "idle", updatedAt: 2, lastReadAt: 2 })).toBe("idle");
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

describe("viewingConversationId", () => {
  const viewing = {
    activePanel: "assistant" as const,
    showConversationList: false,
    activeConversationId: "a",
  };

  it("is the open thread, not the list or another panel", () => {
    expect(viewingConversationId(viewing)).toBe("a");
    expect(viewingConversationId({ ...viewing, activePanel: null })).toBeNull();
    expect(viewingConversationId({ ...viewing, activePanel: "today" })).toBeNull();
    expect(viewingConversationId({ ...viewing, showConversationList: true })).toBeNull();
    expect(viewingConversationId({ ...viewing, activeConversationId: null })).toBeNull();
  });
});

describe("conversationLastReadCatchUp", () => {
  it("copies updatedAt when behind, otherwise no-ops", () => {
    expect(conversationLastReadCatchUp(null)).toBeNull();
    expect(conversationLastReadCatchUp({ lastReadAt: null, updatedAt: 10 })).toBe(10);
    expect(conversationLastReadCatchUp({ lastReadAt: 4, updatedAt: 10 })).toBe(10);
    expect(conversationLastReadCatchUp({ lastReadAt: 10, updatedAt: 10 })).toBeNull();
    expect(conversationLastReadCatchUp({ lastReadAt: 11, updatedAt: 10 })).toBeNull();
  });
});

describe("summarizeConversationActivity", () => {
  const conversations = [
    item({ id: "a", turnStatus: "idle", updatedAt: 2, lastReadAt: 2 }),
    item({ id: "b", turnStatus: "running", updatedAt: 2, lastReadAt: 1 }),
    item({ id: "c", turnStatus: "running", updatedAt: 2, lastReadAt: 1 }),
    item({ id: "d", turnStatus: "error", updatedAt: 2, lastReadAt: 1 }),
    item({ id: "e", turnStatus: "idle", updatedAt: 2, lastReadAt: 1 }),
  ];

  it("counts other running chats and unread completions, ignoring the active chat", () => {
    expect(
      summarizeConversationActivity({
        conversations,
        activeConversationId: "a",
      }),
    ).toEqual({ otherRunningCount: 2, unseenFinishedCount: 1, unseenFailedCount: 1 });
  });

  it("does not count the active chat as running for the back control", () => {
    expect(
      summarizeConversationActivity({
        conversations,
        activeConversationId: "b",
      }),
    ).toEqual({ otherRunningCount: 1, unseenFinishedCount: 1, unseenFailedCount: 1 });
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
