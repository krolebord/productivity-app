import {
  CONVERSATION_LIST_SECTION_LABELS,
  type ConversationActivity,
  type ConversationListItem,
  type ConversationRowStatus,
  conversationRowStatus,
  conversationTimeLabel,
  conversationTitle,
  groupConversations,
  turnElapsedLabel,
} from "@productivity/core/conversation-list";
import { useConversationTurnStarts } from "@productivity/core/data/conversations";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";

const ROW_STATUS_LABELS = {
  running: "running",
  error: "failed",
  unread: "unread",
  idle: null,
} as const satisfies Record<ConversationRowStatus, string | null>;

/**
 * Clock for the relative labels. Rows would otherwise keep whatever "4m" they
 * rendered with, since a sync push is the only thing that re-renders them.
 */
function useNowMs(fast: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), fast ? 1_000 : 30_000);
    return () => clearInterval(id);
  }, [fast]);
  return nowMs;
}

export function confirmDeleteConversation(conversation: Pick<ConversationListItem, "title">, onDelete: () => void) {
  Alert.alert("Delete conversation?", `"${conversationTitle(conversation)}" will be permanently deleted.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onDelete },
  ]);
}

function StatusGlyph({ status }: { status: ConversationRowStatus }) {
  if (status === "running") return <ActivityIndicator size="small" colorClassName="accent-primary" />;
  if (status === "error") return <Icon name="alert-circle" size={14} colorClassName="accent-destructive" />;
  if (status === "unread") return <View className="size-2 rounded-full bg-primary" />;
  return null;
}

/** Count of chats that finished or failed out of sight, over the list button, as the web's back button shows. */
export function ActivityBadge({ activity }: { activity: ConversationActivity }) {
  const unseen = activity.unseenFinishedCount + activity.unseenFailedCount;
  if (unseen > 0) {
    return (
      <View
        pointerEvents="none"
        className={cn(
          "absolute -top-0.5 -right-0.5 h-4 min-w-4 items-center justify-center rounded-full px-1",
          activity.unseenFailedCount > 0 ? "bg-destructive" : "bg-primary",
        )}
      >
        <Text
          className={cn(
            "font-medium text-[10px] leading-none",
            activity.unseenFailedCount > 0 ? "text-white" : "text-primary-foreground",
          )}
        >
          {unseen > 9 ? "9+" : unseen}
        </Text>
      </View>
    );
  }
  if (activity.otherRunningCount > 0) {
    return (
      <View pointerEvents="none" className="absolute right-0 bottom-0">
        <ActivityIndicator size="small" colorClassName="accent-primary" style={{ transform: [{ scale: 0.6 }] }} />
      </View>
    );
  }
  return null;
}

export function ConversationList({
  conversations,
  activeId,
  onOpen,
  onNew,
  onDelete,
}: {
  conversations: ConversationListItem[];
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const hasRunning = conversations.some((conversation) => conversation.turnStatus === "running");
  const nowMs = useNowMs(hasRunning);
  const turnStarts = useConversationTurnStarts();
  const sections = groupConversations({ conversations, nowMs }).map((section) => ({
    kind: section.kind,
    data: section.conversations,
  }));

  if (conversations.length === 0) {
    return (
      <EmptyState icon="message-circle" title="No chats yet" description="Start one and it will show up here.">
        <View className="mt-2">
          <Button label="New conversation" onPress={onNew} />
        </View>
      </EmptyState>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(row) => row.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16, paddingTop: 4 }}
      renderSectionHeader={({ section }) => (
        <Text className="px-5 pt-3 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          {CONVERSATION_LIST_SECTION_LABELS[section.kind]}
        </Text>
      )}
      renderItem={({ item }) => {
        const status = conversationRowStatus(item);
        const label = conversationTitle(item);
        const statusLabel = ROW_STATUS_LABELS[status];
        const active = item.id === activeId;
        const timeLabel =
          status === "running"
            ? turnElapsedLabel({ startedAt: turnStarts.get(item.id) ?? item.updatedAt, nowMs })
            : conversationTimeLabel({ timestamp: item.updatedAt, nowMs });
        return (
          <View className={cn("flex-row items-center pr-2 pl-5", active && "bg-muted/60")}>
            {active && <View className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary" />}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={statusLabel ? `${label}, ${statusLabel}` : label}
              onPress={() => onOpen(item.id)}
              onLongPress={() => confirmDeleteConversation(item, () => onDelete(item.id))}
              className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3 py-2.5 active:opacity-60"
            >
              <View className="w-4 items-center">
                <StatusGlyph status={status} />
              </View>
              <Text
                numberOfLines={1}
                className={cn("min-w-0 flex-1 text-base text-foreground", active && "font-semibold")}
              >
                {label}
              </Text>
              <Text
                className={cn(
                  "font-mono text-xs tabular-nums",
                  status === "running" ? "text-primary" : "text-muted-foreground",
                )}
              >
                {timeLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${label}`}
              hitSlop={6}
              onPress={() => confirmDeleteConversation(item, () => onDelete(item.id))}
              className="size-9 items-center justify-center rounded-full active:bg-muted"
            >
              <Icon name="trash-2" size={15} colorClassName="accent-muted-foreground" />
            </Pressable>
          </View>
        );
      }}
    />
  );
}
