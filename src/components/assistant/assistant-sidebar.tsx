import { useAgentChat } from "@cloudflare/ai-chat/react";
import { formatForDisplay } from "@tanstack/hotkeys";
import { useAgent } from "agents/react";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { ArrowDown, Check, CircleAlert, CircleStop, Loader2, SendHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth } from "@/lib/auth-client";
import { TOGGLE_ASSISTANT_HOTKEY } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

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

export function AssistantSidebar() {
  const auth = useAuth();
  const setOpen = useAssistantStore((s) => s.setOpen);
  const [input, setInput] = useState("");

  const agent = useAgent({ agent: "assistant-agent", name: `user-${auth.userId}` });
  const { messages, sendMessage, status, stop, error, clearHistory, isServerStreaming } = useAgentChat({ agent });

  const isWorking = status === "submitted" || status === "streaming" || isServerStreaming;

  function submit() {
    const text = input.trim();
    if (!text || isWorking) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Sparkles className="size-4 text-primary" />
        <span className="flex-1 font-semibold text-sm">Assistant</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Clear conversation"
              disabled={messages.length === 0 || isWorking}
              onClick={clearHistory}
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear conversation</TooltipContent>
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
