import { format } from "date-fns";
import { localMidnightMs } from "./date-time";
import type { ConversationItem } from "./user-db/migrations";

export type ConversationListItem = Pick<
  ConversationItem,
  "id" | "title" | "updatedAt" | "lastReadAt" | "turnStatus" | "model" | "totalCost" | "totalTokens"
>;

export type ConversationTurnStatus = ConversationItem["turnStatus"];

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

/** Row state, which merges the synced turn status with the lastReadAt receipt. */
export type ConversationRowStatus = "running" | "error" | "unread" | "idle";

export function conversationTitle(conversation: Pick<ConversationListItem, "title">) {
  return conversation.title || "New conversation";
}

export function isConversationUnread(
  conversation: Pick<ConversationListItem, "turnStatus" | "updatedAt" | "lastReadAt">,
): boolean {
  if (conversation.turnStatus === "running") return false;
  if (conversation.lastReadAt == null) return false;
  return conversation.updatedAt > conversation.lastReadAt;
}

export function conversationRowStatus(
  conversation: Pick<ConversationListItem, "turnStatus" | "updatedAt" | "lastReadAt">,
): ConversationRowStatus {
  if (conversation.turnStatus === "running") return "running";
  if (conversation.turnStatus === "error") return "error";
  return isConversationUnread(conversation) ? "unread" : "idle";
}

function sectionKind(input: {
  conversation: ConversationListItem;
  todayStart: number;
  yesterdayStart: number;
  monthStart: number;
}): ConversationListSectionKind {
  const { conversation } = input;
  if (conversation.turnStatus === "running") return "running";
  if (isConversationUnread(conversation)) return "unread";
  if (conversation.updatedAt >= input.todayStart) return "today";
  if (conversation.updatedAt >= input.yesterdayStart) return "yesterday";
  if (conversation.updatedAt >= input.monthStart) return "month";
  return "older";
}

export function groupConversations(input: {
  conversations: readonly ConversationListItem[];
  nowMs: number;
}): ConversationListSection[] {
  const now = new Date(input.nowMs);
  const todayStart = localMidnightMs(now);
  // Day-of-month arithmetic normalizes across month ends, and staying on local
  // midnights keeps the boundaries right through a DST shift.
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const buckets: Record<ConversationListSectionKind, ConversationListItem[]> = {
    running: [],
    unread: [],
    today: [],
    yesterday: [],
    month: [],
    older: [],
  };

  for (const conversation of input.conversations) {
    buckets[sectionKind({ conversation, todayStart, yesterdayStart, monthStart })].push(conversation);
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

/** The open thread, or null when the list/another panel is showing. */
export function viewingConversationId(input: {
  activePanel: "assistant" | "today" | null;
  showConversationList: boolean;
  activeConversationId: string | null;
}) {
  if (input.activePanel !== "assistant" || input.showConversationList) return null;
  return input.activeConversationId;
}

/** Next lastReadAt to persist, or null if missing or already current. */
export function conversationLastReadCatchUp(
  conversation: Pick<ConversationListItem, "lastReadAt" | "updatedAt"> | null | undefined,
): number | null {
  if (conversation == null) return null;
  if (conversation.lastReadAt != null && conversation.lastReadAt >= conversation.updatedAt) return null;
  return conversation.updatedAt;
}

export function summarizeConversationActivity(input: {
  conversations: readonly Pick<ConversationListItem, "id" | "turnStatus" | "updatedAt" | "lastReadAt">[];
  activeConversationId: string;
}): ConversationActivity {
  let otherRunningCount = 0;
  let unseenFinishedCount = 0;
  let unseenFailedCount = 0;
  for (const conversation of input.conversations) {
    if (conversation.id === input.activeConversationId) continue;
    if (conversation.turnStatus === "running") {
      otherRunningCount += 1;
      continue;
    }
    if (!isConversationUnread(conversation)) continue;
    if (conversation.turnStatus === "error") unseenFailedCount += 1;
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
