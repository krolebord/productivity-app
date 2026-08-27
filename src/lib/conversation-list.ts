import { format } from "date-fns";
import { localMidnightMs } from "@/lib/date-time";
import type { ConversationItem } from "@/user-db/migrations";

export type ConversationListItem = Pick<
  ConversationItem,
  "id" | "title" | "updatedAt" | "turnStatus" | "model" | "totalCost" | "totalTokens"
>;

export type ConversationTurnStatus = ConversationItem["turnStatus"];
export type UnseenCompletionStatus = Exclude<ConversationTurnStatus, "running">;

export type ConversationListSectionKind = "running" | "unread" | "today" | "yesterday" | "month" | "older";

export type ConversationListSection = {
  kind: ConversationListSectionKind;
  conversations: ConversationListItem[];
};

export const CONVERSATION_LIST_SECTION_LABELS = {
  running: "Running",
  unread: "Unread",
  today: "Today",
  yesterday: "Yesterday",
  month: "Earlier this month",
  older: "Older",
} as const satisfies Record<ConversationListSectionKind, string>;

const SECTION_ORDER = ["running", "unread", "today", "yesterday", "month", "older"] as const;

export type ConversationActivity = {
  otherRunningCount: number;
  unseenFinishedCount: number;
  unseenFailedCount: number;
};

/** Row state, which merges the synced turn status with the local unread marker. */
export type ConversationRowStatus = "running" | "error" | "unread" | "idle";

export function conversationTitle(conversation: Pick<ConversationListItem, "title">) {
  return conversation.title || "New conversation";
}

export function conversationRowStatus(input: {
  conversation: Pick<ConversationListItem, "id" | "turnStatus">;
  unseenCompletions: Record<string, UnseenCompletionStatus>;
}): ConversationRowStatus {
  if (input.conversation.turnStatus === "running") return "running";
  if (input.conversation.turnStatus === "error") return "error";
  const unseen = input.unseenCompletions[input.conversation.id];
  if (unseen === "error") return "error";
  return unseen === "idle" ? "unread" : "idle";
}

function sectionKind(input: {
  conversation: ConversationListItem;
  unseenCompletions: Record<string, UnseenCompletionStatus>;
  todayStart: number;
  yesterdayStart: number;
  monthStart: number;
}): ConversationListSectionKind {
  const { conversation } = input;
  if (conversation.turnStatus === "running") return "running";
  if (conversation.id in input.unseenCompletions) return "unread";
  if (conversation.updatedAt >= input.todayStart) return "today";
  if (conversation.updatedAt >= input.yesterdayStart) return "yesterday";
  if (conversation.updatedAt >= input.monthStart) return "month";
  return "older";
}

export function groupConversations(input: {
  conversations: readonly ConversationListItem[];
  nowMs: number;
  unseenCompletions?: Record<string, UnseenCompletionStatus>;
}): ConversationListSection[] {
  const now = new Date(input.nowMs);
  const todayStart = localMidnightMs(now);
  // Day-of-month arithmetic normalizes across month ends, and staying on local
  // midnights keeps the boundaries right through a DST shift.
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const unseenCompletions = input.unseenCompletions ?? {};

  const buckets: Record<ConversationListSectionKind, ConversationListItem[]> = {
    running: [],
    unread: [],
    today: [],
    yesterday: [],
    month: [],
    older: [],
  };

  for (const conversation of input.conversations) {
    buckets[sectionKind({ conversation, unseenCompletions, todayStart, yesterdayStart, monthStart })].push(
      conversation,
    );
  }

  return SECTION_ORDER.filter((kind) => buckets[kind].length > 0).map((kind) => ({
    kind,
    conversations: buckets[kind],
  }));
}

/** Right-hand cell of a row: "now", "4m", "2h", "18:40", "21 Aug", "21 Aug 25". */
export function conversationTimeLabel(input: { timestamp: number; nowMs: number }): string {
  const now = new Date(input.nowMs);
  const todayStart = localMidnightMs(now);

  if (input.timestamp >= todayStart) {
    const minutes = Math.floor(Math.max(0, input.nowMs - input.timestamp) / 60_000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h`;
  }

  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (input.timestamp >= yesterdayStart) return format(input.timestamp, "HH:mm");
  if (new Date(input.timestamp).getFullYear() === now.getFullYear()) return format(input.timestamp, "d MMM");
  return format(input.timestamp, "d MMM yy");
}

/** How long the current turn has been running, as "0:24" or "1:04:09". */
export function turnElapsedLabel(input: { startedAt: number; nowMs: number }): string {
  const total = Math.floor(Math.max(0, input.nowMs - input.startedAt) / 1000);
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${seconds}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
}

export function unseenCompletionFromTransition(
  previous: ConversationTurnStatus | undefined,
  next: ConversationTurnStatus,
): UnseenCompletionStatus | null {
  if (previous !== "running") return null;
  if (next === "idle" || next === "error") return next;
  return null;
}

/** Completions the user is already looking at should not land in Unread. */
export function shouldRecordUnseenCompletion(input: {
  conversationId: string;
  activePanel: "assistant" | "today" | null;
  showConversationList: boolean;
  activeConversationId: string | null;
}) {
  if (input.activePanel !== "assistant") return true;
  // The list shows Unread as its own section, so a turn that lands while the user
  // is reading the list still gets marked; only the open chat is exempt.
  if (input.showConversationList) return true;
  return input.activeConversationId !== input.conversationId;
}

export function summarizeConversationActivity(input: {
  conversations: readonly Pick<ConversationListItem, "id" | "turnStatus">[];
  activeConversationId: string;
  unseenCompletions: Record<string, UnseenCompletionStatus>;
}): ConversationActivity {
  const conversationIds = new Set(input.conversations.map((conversation) => conversation.id));
  let otherRunningCount = 0;
  for (const conversation of input.conversations) {
    if (conversation.turnStatus === "running" && conversation.id !== input.activeConversationId) {
      otherRunningCount += 1;
    }
  }

  let unseenFinishedCount = 0;
  let unseenFailedCount = 0;
  for (const [id, status] of Object.entries(input.unseenCompletions)) {
    if (id === input.activeConversationId || !conversationIds.has(id)) continue;
    if (status === "error") unseenFailedCount += 1;
    else unseenFinishedCount += 1;
  }

  return { otherRunningCount, unseenFinishedCount, unseenFailedCount };
}

export function conversationActivityLabel(activity: ConversationActivity) {
  const parts: string[] = [];
  if (activity.otherRunningCount > 0) {
    parts.push(activity.otherRunningCount === 1 ? "1 chat running" : `${activity.otherRunningCount} chats running`);
  }
  if (activity.unseenFinishedCount > 0) {
    parts.push(
      activity.unseenFinishedCount === 1 ? "1 chat finished" : `${activity.unseenFinishedCount} chats finished`,
    );
  }
  if (activity.unseenFailedCount > 0) {
    parts.push(activity.unseenFailedCount === 1 ? "1 chat failed" : `${activity.unseenFailedCount} chats failed`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}
