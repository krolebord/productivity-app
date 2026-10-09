import { ChevronLeft, CircleAlert, Loader2, PlusIcon, Sparkles, Trash2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { AssistantHeaderActions } from "@/components/assistant/assistant-header-actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CONVERSATION_LIST_SECTION_LABELS,
  type ConversationActivity,
  type ConversationListItem,
  type ConversationRowStatus,
  conversationActivityLabel,
  conversationRowStatus,
  conversationTimeLabel,
  conversationTitle,
  groupConversations,
  summarizeConversationActivity,
  turnElapsedLabel,
} from "@/lib/conversation-list";
import { useAssistantNavigation } from "@/lib/use-assistant-navigation";
import { useIsAssistantPage } from "@/lib/use-assistant-surface";
import { cn } from "@/lib/utils";
import { useDbQuery } from "@/user-db/user-db";
import { useConfirmDialogStore } from "../confirm-dialog";

const ROW_SELECTOR = "[data-conversation-row]";

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

/**
 * Turn start per conversation. The agent writes the user row with the turn's
 * timestamp immediately before flipping turnStatus to running, so the newest
 * user message is when the current turn began.
 */
function useTurnStarts() {
  return useDbQuery(
    (db) =>
      db
        .selectFrom("conversation_message")
        .select((eb) => ["conversationId", eb.fn.max("createdAt").as("startedAt")])
        .where("role", "=", "user")
        .groupBy("conversationId"),
    {
      mapData: (rows) => new Map(rows.map((row) => [row.conversationId, Number(row.startedAt ?? 0)])),
    },
  );
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
      className={cn(
        "shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive",
        className,
      )}
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
  const { openConversationList } = useAssistantNavigation();
  const activity = summarizeConversationActivity({
    conversations,
    activeConversationId,
  });
  const activityLabel = conversationActivityLabel(activity);
  const unseenCount = activity.unseenFinishedCount + activity.unseenFailedCount;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative size-8 text-muted-foreground"
            aria-label={activityLabel ? `Back to chats, ${activityLabel}` : "Back to chats"}
            onClick={() => openConversationList()}
          />
        }
      >
        <ChevronLeft className="size-4" />
        {activity.otherRunningCount > 0 && (
          <Loader2 className="absolute right-0.5 bottom-0.5 size-3 animate-spin text-primary" aria-hidden="true" />
        )}
        {unseenCount > 0 && <UnseenCompletionBadge activity={activity} count={unseenCount} />}
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

const ROW_STATUS_LABELS = {
  running: "running",
  error: "failed",
  unread: "unread",
  idle: null,
} as const satisfies Record<ConversationRowStatus, string | null>;

function ConversationStatusGlyph({ status }: { status: ConversationRowStatus }) {
  if (status === "running") {
    return <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />;
  }
  if (status === "error") {
    return <CircleAlert className="size-3.5 text-destructive" aria-hidden="true" />;
  }
  if (status === "unread") {
    return <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />;
  }
  return null;
}

function ConversationRow({
  conversation,
  status,
  timeLabel,
  active,
  onOpen,
  onDelete,
}: {
  conversation: ConversationListItem;
  status: ConversationRowStatus;
  timeLabel: string;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const label = conversationTitle(conversation);
  const statusLabel = ROW_STATUS_LABELS[status];

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-md px-2 transition-colors",
        "focus-within:bg-muted hover:bg-muted",
        active && "bg-accent/60 focus-within:bg-accent hover:bg-accent",
      )}
    >
      {active && (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />
      )}
      <button
        type="button"
        data-conversation-row
        data-conversation-id={conversation.id}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left outline-none"
        aria-current={active ? "true" : undefined}
        aria-label={statusLabel ? `${label}, ${statusLabel}` : label}
        onClick={onOpen}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <ConversationStatusGlyph status={status} />
        </span>
        <span className={cn("truncate text-sm", active ? "font-semibold" : "font-medium")}>{label}</span>
      </button>
      <div className="grid shrink-0 items-center justify-items-end pl-2">
        <ConversationDeleteButton
          label={label}
          onDelete={onDelete}
          className={cn(
            "peer col-start-1 row-start-1 z-10",
            "opacity-100 md:pointer-events-none md:opacity-0",
            "md:group-hover:pointer-events-auto md:group-hover:opacity-100",
            "md:focus:pointer-events-auto md:focus:opacity-100",
          )}
        />
        <span
          className={cn(
            "col-start-1 row-start-1 pointer-events-none font-mono text-[11px] tabular-nums",
            "max-md:opacity-0 md:group-hover:opacity-0 md:peer-focus:opacity-0",
            status === "running" ? "text-primary" : "text-muted-foreground",
          )}
        >
          {timeLabel}
        </span>
      </div>
    </div>
  );
}

/** Arrow keys walk the rows; the row buttons themselves hold focus. */
function moveRowFocus(container: HTMLElement | null, from: EventTarget | null, delta: number | "first" | "last") {
  if (!container) return;
  const rows = [...container.querySelectorAll<HTMLButtonElement>(ROW_SELECTOR)];
  if (rows.length === 0) return;

  if (delta === "first") {
    rows[0].focus();
    return;
  }
  if (delta === "last") {
    rows[rows.length - 1].focus();
    return;
  }

  const index = rows.indexOf(from as HTMLButtonElement);
  const next = index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + delta));
  rows[next]?.focus();
}

export function ConversationList({
  conversations,
  activeId,
  onDeleteConversation,
}: {
  conversations: ConversationListItem[];
  activeId: string;
  onDeleteConversation: (conversation: { id: string }) => void;
}) {
  const { openConversation, openNewConversation } = useAssistantNavigation();
  const isPage = useIsAssistantPage();
  const confirm = useConfirmDialogStore((s) => s.confirm);
  const listRef = useRef<HTMLDivElement>(null);

  const hasRunning = conversations.some((conversation) => conversation.turnStatus === "running");
  const nowMs = useNowMs(hasRunning);
  const { data: turnStarts } = useTurnStarts();
  const sections = groupConversations({ conversations, nowMs });

  // Land focus on the open chat so the arrow keys work without a click first.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = listRef.current;
      if (!container) return;
      const rows = [...container.querySelectorAll<HTMLButtonElement>(ROW_SELECTOR)];
      const current = rows.find((row) => row.getAttribute("aria-current") === "true");
      (current ?? rows[0])?.focus({ preventScroll: true });
      current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveRowFocus(listRef.current, event.target, 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveRowFocus(listRef.current, event.target, -1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveRowFocus(listRef.current, event.target, "first");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveRowFocus(listRef.current, event.target, "last");
      return;
    }
    if (event.key === "Backspace" && (event.metaKey || event.ctrlKey)) {
      const row = (event.target as HTMLElement).closest<HTMLButtonElement>(ROW_SELECTOR);
      const id = row?.dataset.conversationId;
      const conversation = conversations.find((item) => item.id === id);
      if (!conversation) return;
      event.preventDefault();
      confirm({
        title: "Delete conversation",
        description: `"${conversationTitle(conversation)}" will be permanently deleted. This cannot be undone.`,
        confirmLabel: "Delete",
        onConfirm: () => onDeleteConversation(conversation),
      });
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <h2 className="truncate font-semibold text-sm">Chats</h2>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label="New conversation"
                onClick={openNewConversation}
              />
            }
          >
            <PlusIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">New conversation</TooltipContent>
        </Tooltip>
        <AssistantHeaderActions />
      </div>

      {conversations.length === 0 ? (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center gap-3 px-4 py-12 text-center",
            isPage && "max-md:pb-32",
          )}
        >
          <Sparkles className="size-6 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">No chats yet</p>
            <p className="text-muted-foreground text-sm">Start one and it will show up here.</p>
          </div>
          <Button type="button" size="sm" onClick={openNewConversation}>
            New conversation
          </Button>
        </div>
      ) : (
        // Key handling sits on the container: the rows are the focus targets, and
        // arrow keys move focus between them rather than each row tracking a cursor.
        <div
          ref={listRef}
          className={cn("min-h-0 flex-1 overflow-y-auto p-1.5", isPage && "max-md:pb-32")}
          onKeyDown={onListKeyDown}
        >
          {sections.map((section) => (
            <section key={section.kind} className="pb-1.5">
              <h3 className="px-2.5 py-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                {CONVERSATION_LIST_SECTION_LABELS[section.kind]}
              </h3>
              {section.conversations.map((conversation) => {
                const status = conversationRowStatus(conversation);
                return (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    status={status}
                    timeLabel={
                      status === "running"
                        ? turnElapsedLabel({
                            startedAt: turnStarts.get(conversation.id) ?? conversation.updatedAt,
                            nowMs,
                          })
                        : conversationTimeLabel({ timestamp: conversation.updatedAt, nowMs })
                    }
                    active={conversation.id === activeId}
                    onOpen={() => openConversation(conversation.id)}
                    onDelete={() => onDeleteConversation(conversation)}
                  />
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
