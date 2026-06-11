import { useAgentChat } from "@cloudflare/ai-chat/react";
import { generateId } from "@sqlite-sync/core";
import { formatForDisplay } from "@tanstack/hotkeys";
import { useAgent } from "agents/react";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import {
  ArrowDown,
  Check,
  ChevronDown,
  CircleAlert,
  CircleStop,
  Loader2,
  PlusIcon,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { useConfirmDialogStore } from "@/components/confirm-dialog";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth } from "@/lib/auth-client";
import { TOGGLE_ASSISTANT_HOTKEY } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { useDb, useDbQuery } from "@/user-db/user-db";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type ConversationRow = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

function ToolCallChip({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = part.type === "dynamic-tool" ? part.toolName : getToolName(part);
  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";

  return (
    <div className="flex w-fit items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      {failed ? (
        <CircleAlert className="size-3 text-destructive" />
      ) : done ? (
        <Check className="size-3" />
      ) : (
        <Loader2 className="size-3 animate-spin" />
      )}
      <span className="font-mono">{name}</span>
    </div>
  );
}

function MessageParts({ message }: { message: UIMessage }) {
  return message.parts.map((part, i) => {
    if (part.type === "dynamic-tool" || isToolUIPart(part)) {
      return <ToolCallChip key={i} part={part} />;
    }

    if (part.type !== "text" || !part.text) return null;

    if (message.role === "user") {
      return (
        <div key={i} className="whitespace-pre-wrap break-words">
          {part.text}
        </div>
      );
    }

    return <Streamdown key={i}>{part.text}</Streamdown>;
  });
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="absolute bottom-3 left-1/2 size-8 -translate-x-1/2 rounded-full border shadow-md"
      aria-label="Scroll to bottom"
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="size-4" />
    </Button>
  );
}

function conversationLabel(conversation: ConversationRow) {
  return conversation.title || "New conversation";
}

function ConversationSwitcher({
  conversations,
  active,
  onDeleteConversation,
}: {
  conversations: ConversationRow[];
  active: ConversationRow;
  onDeleteConversation: (conversation: ConversationRow) => void;
}) {
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left font-semibold text-sm transition-colors hover:bg-accent"
          aria-label="Switch conversation"
        >
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="truncate">{conversationLabel(active)}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {conversations.map((conversation) => (
          <DropdownMenuItem
            key={conversation.id}
            className={cn("group gap-2", conversation.id === active.id && "bg-accent")}
            onClick={() => setActiveConversation(conversation.id)}
          >
            <span className="flex-1 truncate">{conversationLabel(conversation)}</span>
            <button
              type="button"
              className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label={`Delete ${conversationLabel(conversation)}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation(conversation);
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConversationView({
  conversation,
  conversations,
}: {
  conversation: ConversationRow;
  conversations: ConversationRow[];
}) {
  const auth = useAuth();
  const db = useDb();
  const setOpen = useAssistantStore((s) => s.setOpen);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const [input, setInput] = useState("");

  const agent = useAgent({ agent: "assistant-agent", name: `user-${auth.userId}:${conversation.id}` });
  const { messages, sendMessage, status, stop, error, isServerStreaming } = useAgentChat({ agent });
  const confirm = useConfirmDialogStore((s) => s.confirm);

  const isWorking = status === "submitted" || status === "streaming" || isServerStreaming;

  function requestDeleteConversation(target: ConversationRow) {
    confirm({
      title: "Delete conversation?",
      description: `"${conversationLabel(target)}" and its messages will be deleted.`,
      confirmLabel: "Delete",
      onConfirm: () => {
        db.db.executeKysely((q) => q.deleteFrom("conversation").where("id", "=", target.id));
        if (target.id === conversation.id) {
          setActiveConversation(null);
        }
      },
    });
  }

  function newConversation() {
    // An empty active conversation already is a "new" one — just stay on it.
    if (messages.length === 0) return;
    const id = generateId();
    const now = Date.now();
    db.db.executeKysely((q) =>
      q.insertInto("conversation").values({ id, title: "", createdAt: now, updatedAt: now, tombstone: false }),
    );
    setActiveConversation(id);
  }

  function submit() {
    const text = input.trim();
    if (!text || isWorking) return;
    sendMessage({ text });
    db.db.executeKysely((q) =>
      q
        .updateTable("conversation")
        .set({ updatedAt: Date.now(), ...(messages.length === 0 && { title: text.slice(0, 80) }) })
        .where("id", "=", conversation.id),
    );
    setInput("");
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <ConversationSwitcher
          conversations={conversations}
          active={conversation}
          onDeleteConversation={requestDeleteConversation}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="New conversation"
              onClick={newConversation}
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
              aria-label="Delete conversation"
              onClick={() => requestDeleteConversation(conversation)}
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete conversation</TooltipContent>
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
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close ({formatForDisplay(TOGGLE_ASSISTANT_HOTKEY)})</TooltipContent>
        </Tooltip>
      </div>

      <StickToBottom className="relative min-h-0 flex-1 overflow-y-auto" resize="smooth" initial="instant">
        <StickToBottom.Content className="flex flex-col gap-4 p-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Sparkles className="size-6" />
              <p className="text-sm">Ask anything about your notes, accounts, or plans.</p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "min-w-0 space-y-2 text-sm",
                message.role === "user" && "ml-8 self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground",
              )}
            >
              <MessageParts message={message} />
            </div>
          ))}
          {isWorking && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-3.5 animate-spin" />
              Thinking…
            </div>
          )}
        </StickToBottom.Content>
        <ScrollToBottomButton />
      </StickToBottom>

      {error && (
        <div className="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {error.message || "Something went wrong. Try again."}
        </div>
      )}

      <form
        className="flex shrink-0 items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Send a message…"
          rows={2}
          className="max-h-40 min-h-0 flex-1 resize-none"
        />
        {isWorking ? (
          <Button type="button" variant="secondary" size="icon" aria-label="Stop generating" onClick={() => stop()}>
            <CircleStop className="size-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim()}>
            <SendHorizontal className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}

export function AssistantSidebar() {
  const db = useDb();
  const activeConversationId = useAssistantStore((s) => s.activeConversationId);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);

  const { data: conversations } = useDbQuery((db) =>
    db.selectFrom("conversation").select(["id", "title", "createdAt", "updatedAt"]).orderBy("updatedAt", "desc"),
  );

  const active = conversations.find((c) => c.id === activeConversationId) ?? conversations[0];

  const creatingRef = useRef(false);
  useEffect(() => {
    if (active) {
      creatingRef.current = false;
      if (active.id !== activeConversationId) {
        setActiveConversation(active.id);
      }
      return;
    }
    if (creatingRef.current) return;
    creatingRef.current = true;
    const id = generateId();
    const now = Date.now();
    db.db.executeKysely((q) =>
      q.insertInto("conversation").values({ id, title: "", createdAt: now, updatedAt: now, tombstone: false }),
    );
    setActiveConversation(id);
  }, [active, activeConversationId, db, setActiveConversation]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ConversationView key={active.id} conversation={active} conversations={conversations} />;
}
