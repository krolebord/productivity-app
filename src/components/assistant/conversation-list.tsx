import { generateId } from "@sqlite-sync/core";
import { formatForDisplay } from "@tanstack/hotkeys";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, CircleAlert, Loader2, PlusIcon, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseDateKey } from "@/lib/agenda";
import { useAssistantStore } from "@/lib/assistant-store";
import {
  CONVERSATION_LIST_SECTION_LABELS,
  type ConversationActivity,
  type ConversationListItem,
  conversationActivityLabel,
  conversationModelLabel,
  conversationTitle,
  groupConversations,
  summarizeConversationActivity,
} from "@/lib/conversation-list";
import { TOGGLE_ASSISTANT_HOTKEY } from "@/lib/hotkeys";
import { useCurrentDayKey } from "@/lib/use-current-day";
import { cn } from "@/lib/utils";
import { useConfirmDialogStore } from "../confirm-dialog";

function formatCost(cost: number) {
  if (cost > 0 && cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function ConversationDeleteButton({
  label,
  onDelete,
  className,
}: {
  label: string;
  onDelete: () => void;
  className?: string;
}) {
  const confirm = useConfirmDialogStore((s) => s.confirm);
  return (
    <button
      type="button"
      className={cn("rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-destructive", className)}
      aria-label={`Delete ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        confirm({
          title: "Delete conversation",
          description: `"${label}" will be permanently deleted. This cannot be undone.`,
          confirmLabel: "Delete",
          onConfirm: onDelete,
        });
      }}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

export function ChatsBackButton({
  conversations,
  activeConversationId,
}: {
  conversations: ConversationListItem[];
  activeConversationId: string;
}) {
  const openConversationList = useAssistantStore((s) => s.openConversationList);
  const unseenCompletions = useAssistantStore((s) => s.unseenCompletions);
  const activity = summarizeConversationActivity({
    conversations,
    activeConversationId,
    unseenCompletions,
  });
  const activityLabel = conversationActivityLabel(activity);
  const unseenCount = activity.unseenFinishedCount + activity.unseenFailedCount;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-8 text-muted-foreground"
          aria-label={activityLabel ? `Back to chats, ${activityLabel}` : "Back to chats"}
          onClick={() => openConversationList()}
        >
          <ChevronLeft className="size-4" />
          {activity.otherRunningCount > 0 && (
            <Loader2 className="absolute right-0.5 bottom-0.5 size-3 animate-spin text-primary" aria-hidden="true" />
          )}
          {unseenCount > 0 && <UnseenCompletionBadge activity={activity} count={unseenCount} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{activityLabel ?? "All chats"}</TooltipContent>
    </Tooltip>
  );
}

function UnseenCompletionBadge({ activity, count }: { activity: ConversationActivity; count: number }) {
  return (
    <span
      className={cn(
        "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-medium text-[10px] leading-none",
        activity.unseenFailedCount > 0 ? "bg-destructive text-white" : "bg-primary text-primary-foreground",
      )}
      aria-hidden="true"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function ConversationStatusIcon({ conversation }: { conversation: ConversationListItem }) {
  if (conversation.turnStatus === "running") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />;
  }
  if (conversation.turnStatus === "error") {
    return <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />;
  }
  return <span className="size-3.5 shrink-0" aria-hidden="true" />;
}

function ConversationMeta({ conversation }: { conversation: ConversationListItem }) {
  const parts: string[] = [];
  const modelLabel = conversationModelLabel(conversation.model);
  if (modelLabel) parts.push(modelLabel);
  parts.push(formatDistanceToNow(conversation.updatedAt, { addSuffix: true }));
  if (conversation.totalCost > 0 || conversation.totalTokens > 0) {
    parts.push(formatCost(conversation.totalCost));
  }

  return <p className="truncate text-muted-foreground text-xs">{parts.join(" · ")}</p>;
}

function ConversationListRow({
  conversation,
  active,
  onOpen,
  onDelete,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const label = conversationTitle(conversation);
  const statusLabel =
    conversation.turnStatus === "running" ? "running" : conversation.turnStatus === "error" ? "failed" : null;

  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent",
        active && "bg-accent",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-2"
        aria-current={active ? "true" : undefined}
        aria-label={statusLabel ? `${label}, ${statusLabel}` : label}
        onClick={onOpen}
      >
        <span className="mt-0.5">
          <ConversationStatusIcon conversation={conversation} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">{label}</span>
          <ConversationMeta conversation={conversation} />
        </span>
      </button>
      <ConversationDeleteButton
        label={label}
        onDelete={onDelete}
        className="mt-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100"
      />
    </div>
  );
}

export function ConversationList({
  conversations,
  activeId,
  onDeleteConversation,
}: {
  conversations: ConversationListItem[];
  activeId: string;
  onDeleteConversation: (conversation: { id: string }) => Promise<void> | void;
}) {
  const closePanel = useAssistantStore((s) => s.closePanel);
  const openConversation = useAssistantStore((s) => s.openConversation);
  const dayKey = useCurrentDayKey();
  const sections = groupConversations({
    conversations,
    nowMs: parseDateKey(dayKey).getTime(),
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="truncate font-semibold text-sm">Chats</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="New conversation"
              onClick={() => openConversation(generateId())}
            >
              <PlusIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New conversation</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Close assistant"
              aria-keyshortcuts={TOGGLE_ASSISTANT_HOTKEY}
              onClick={closePanel}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Close <span className="hidden md:inline">({formatForDisplay(TOGGLE_ASSISTANT_HOTKEY)})</span>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Sparkles className="size-6 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">No conversations yet</p>
              <p className="text-muted-foreground text-sm">Start one and it will show up here.</p>
            </div>
            <Button type="button" size="sm" onClick={() => openConversation(generateId())}>
              New conversation
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <section key={section.kind}>
                <h2 className="px-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {CONVERSATION_LIST_SECTION_LABELS[section.kind]}
                </h2>
                <div className="flex flex-col">
                  {section.conversations.map((conversation) => (
                    <ConversationListRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeId}
                      onOpen={() => openConversation(conversation.id)}
                      onDelete={() => onDeleteConversation(conversation)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
