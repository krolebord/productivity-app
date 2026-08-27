import { getAssistantModel, isAssistantModelId } from "@/agent/models";
import { localMidnightMs } from "@/lib/date-time";
import type { ConversationItem } from "@/user-db/migrations";

export type ConversationListItem = Pick<
  ConversationItem,
  "id" | "title" | "updatedAt" | "turnStatus" | "model" | "totalCost" | "totalTokens"
>;

export type ConversationTurnStatus = ConversationItem["turnStatus"];
export type UnseenCompletionStatus = Exclude<ConversationTurnStatus, "running">;

export type ConversationListSectionKind = "running" | "today" | "older";

export type ConversationListSection = {
  kind: ConversationListSectionKind;
  conversations: ConversationListItem[];
};

export const CONVERSATION_LIST_SECTION_LABELS = {
  running: "Running",
  today: "Today",
  older: "Older",
} as const satisfies Record<ConversationListSectionKind, string>;

export type ConversationActivity = {
  otherRunningCount: number;
  unseenFinishedCount: number;
  unseenFailedCount: number;
};

export function conversationTitle(conversation: Pick<ConversationListItem, "title">) {
  return conversation.title || "New conversation";
}

export function conversationModelLabel(model: string | null) {
  if (!model || !isAssistantModelId(model)) return null;
  return getAssistantModel(model)?.label ?? null;
}

export function groupConversations(input: {
  conversations: readonly ConversationListItem[];
  nowMs: number;
}): ConversationListSection[] {
  const running: ConversationListItem[] = [];
  const today: ConversationListItem[] = [];
  const older: ConversationListItem[] = [];
  const todayStart = localMidnightMs(new Date(input.nowMs));

  for (const conversation of input.conversations) {
    if (conversation.turnStatus === "running") {
      running.push(conversation);
      continue;
    }
    if (conversation.updatedAt >= todayStart) today.push(conversation);
    else older.push(conversation);
  }

  const sections: ConversationListSection[] = [];
  if (running.length > 0) sections.push({ kind: "running", conversations: running });
  if (today.length > 0) sections.push({ kind: "today", conversations: today });
  if (older.length > 0) sections.push({ kind: "older", conversations: older });
  return sections;
}

export function unseenCompletionFromTransition(
  previous: ConversationTurnStatus | undefined,
  next: ConversationTurnStatus,
): UnseenCompletionStatus | null {
  if (previous !== "running") return null;
  if (next === "idle" || next === "error") return next;
  return null;
}

/** Completions the user is already looking at should not badge the back button. */
export function shouldRecordUnseenCompletion(input: {
  conversationId: string;
  activePanel: "assistant" | "today" | null;
  showConversationList: boolean;
  activeConversationId: string | null;
}) {
  if (input.activePanel !== "assistant") return true;
  if (input.showConversationList) return false;
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
