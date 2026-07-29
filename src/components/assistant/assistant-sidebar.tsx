import { useAgentChat } from "@cloudflare/ai-chat/react";
import { generateId } from "@sqlite-sync/core";
import { formatForDisplay } from "@tanstack/hotkeys";
import { Link } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { sql } from "kysely";
import {
  ArrowDown,
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  CircleStop,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  PlusIcon,
  Search,
  SendHorizontal,
  Sparkles,
  Trash2,
  Type,
  Video,
  Workflow,
  X,
} from "lucide-react";
import { type ClipboardEvent, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Streamdown } from "streamdown";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import {
  ASSISTANT_MODELS,
  ASSISTANT_MODELS_BY_PRICE,
  type AssistantModel,
  type AssistantModelId,
  type AssistantModelInputModality,
  resolveAssistantModelId,
} from "@/agent/models";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth } from "@/lib/auth-client";
import { TOGGLE_ASSISTANT_HOTKEY } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { useDb, useDbQuery } from "@/user-db/user-db";
import { useConfirmDialogStore } from "../confirm-dialog";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { useInlineConfirm } from "../ui/inline-confirm";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type ConversationRow = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string | null;
  totalCost: number;
  totalTokens: number;
};

type UploadedWorkspaceFile = {
  filename: string;
  mediaType: string;
  size: number;
  path: string;
};

const MAX_UPLOAD_FILES = 5;

// Recharts is heavy; keep it out of the main bundle until a chart is rendered.
const ChartCard = lazy(() => import("./chart-card"));

function getExtensionForMediaType(mediaType: string) {
  switch (mediaType) {
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

function getPastedImageFiles(event: ClipboardEvent<HTMLTextAreaElement>) {
  return Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      const mediaType = file.type || item.type || "image/png";
      const name =
        file.name && file.name !== "image.png"
          ? file.name
          : `pasted-image-${index + 1}.${getExtensionForMediaType(mediaType)}`;
      return new File([file], name, { type: mediaType, lastModified: Date.now() });
    })
    .filter((file): file is File => file !== null);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCost(cost: number) {
  if (cost > 0 && cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatModelPrice(price: number) {
  if (price >= 1) return `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`;
  return `$${price.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatModelPricing(model: AssistantModel) {
  return `${formatModelPrice(model.pricing.inputPerMillion)} in / ${formatModelPrice(model.pricing.outputPerMillion)} out per 1M`;
}

function DownloadFileChip({ conversationId, file }: { conversationId: string; file: UploadedWorkspaceFile }) {
  const href = `/api/assistant/download?conversationId=${encodeURIComponent(conversationId)}&path=${encodeURIComponent(file.path)}`;

  return (
    <a
      href={href}
      download={file.filename}
      className="flex w-fit items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-foreground text-xs transition-colors hover:bg-accent"
    >
      <Download className="size-3.5 shrink-0" />
      <span className="max-w-48 truncate">{file.filename}</span>
      <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
    </a>
  );
}

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

type SearchToolOutput = {
  query?: string;
  answer?: string;
  results?: { title?: string | null; url: string }[];
};

type ExtractToolOutput = {
  results?: { title?: string | null; url: string }[];
  failedResults?: { url: string }[];
};

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourceLink({ url, title }: { url: string; title?: string | null }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-1.5 rounded-sm px-1 py-0.5 hover:bg-accent"
    >
      <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-foreground">{title || hostname(url)}</span>
        <span className="block truncate text-muted-foreground/70">{hostname(url)}</span>
      </span>
    </a>
  );
}

function WebToolDetails({ name, output }: { name: string; output: unknown }) {
  if (name === "web_search") {
    const { answer, results = [] } = (output ?? {}) as SearchToolOutput;
    return (
      <div className="flex max-w-sm flex-col gap-1">
        {answer && <p className="line-clamp-6 px-1 text-muted-foreground">{answer}</p>}
        {results.map((result) => (
          <SourceLink key={result.url} url={result.url} title={result.title} />
        ))}
        {results.length === 0 && !answer && <p className="px-1 text-muted-foreground">No results.</p>}
      </div>
    );
  }

  const { results = [], failedResults = [] } = (output ?? {}) as ExtractToolOutput;
  return (
    <div className="flex max-w-sm flex-col gap-1">
      {results.map((result) => (
        <SourceLink key={result.url} url={result.url} title={result.title} />
      ))}
      {failedResults.map((result) => (
        <span key={result.url} className="flex items-center gap-1.5 px-1 text-destructive">
          <CircleAlert className="size-3 shrink-0" />
          <span className="truncate">{hostname(result.url)}</span>
        </span>
      ))}
      {results.length === 0 && failedResults.length === 0 && <p className="px-1 text-muted-foreground">No content.</p>}
    </div>
  );
}

function WebToolChip({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const [open, setOpen] = useState(false);
  const name = part.type === "dynamic-tool" ? part.toolName : getToolName(part);
  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";
  const Icon = name === "web_search" ? Search : FileText;

  const input = part.input as { query?: string; urls?: string[] } | undefined;
  const summary =
    name === "web_search"
      ? input?.query
      : input?.urls?.length
        ? `${input.urls.length} ${input.urls.length === 1 ? "page" : "pages"}`
        : undefined;

  const canExpand = done && !failed;

  return (
    <div className="w-fit max-w-full overflow-hidden rounded-md border bg-muted/50 text-xs">
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1 text-muted-foreground",
          canExpand && "hover:text-foreground",
        )}
      >
        {failed ? (
          <CircleAlert className="size-3 shrink-0 text-destructive" />
        ) : done ? (
          <Icon className="size-3 shrink-0" />
        ) : (
          <Loader2 className="size-3 shrink-0 animate-spin" />
        )}
        <span className="font-mono">{name}</span>
        {summary && <span className="min-w-0 truncate text-muted-foreground/80">{summary}</span>}
        {canExpand && <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />}
      </button>
      {open && canExpand && (
        <div className="border-t px-2 py-1.5">
          <WebToolDetails name={name} output={part.output} />
        </div>
      )}
    </div>
  );
}

function MemoryChip({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = part.type === "dynamic-tool" ? part.toolName : getToolName(part);
  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";
  const input = part.input as { content?: string } | undefined;
  const label = name === "forget" ? "Forgot a memory" : name === "update_memory" ? "Updated a memory" : "Remembered";

  return (
    <Link
      to="/memories"
      className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
    >
      {failed ? (
        <CircleAlert className="size-3 shrink-0 text-destructive" />
      ) : done ? (
        <Brain className="size-3 shrink-0" />
      ) : (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      )}
      <span className="shrink-0">{label}</span>
      {name !== "forget" && input?.content && (
        <span className="min-w-0 truncate text-muted-foreground/80">{input.content}</span>
      )}
    </Link>
  );
}

function resourceFilename(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").at(-1) || path;
}

function ReadFileChip({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";
  const input = part.input as { path?: string } | undefined;
  const filename = input?.path ? resourceFilename(input.path) : undefined;

  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      {failed ? (
        <CircleAlert className="size-3 shrink-0 text-destructive" />
      ) : done ? (
        <FileText className="size-3 shrink-0" />
      ) : (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      )}
      <span className="shrink-0">{done ? "Read file" : failed ? "Read failed" : "Reading file"}</span>
      {filename && <span className="min-w-0 truncate text-muted-foreground/80">{filename}</span>}
    </div>
  );
}

function ActivateSkillChip({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";
  const input = part.input as { name?: string } | undefined;
  const skillId = input?.name;
  const { data: skills } = useDbQuery((db) =>
    db
      .selectFrom("skill")
      .select(["id", "name"])
      .where("id", "=", skillId ?? "")
      .limit(1),
  );
  const name = skills[0] ? skills[0].name || "Untitled skill" : skillId;

  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      {failed ? (
        <CircleAlert className="size-3 shrink-0 text-destructive" />
      ) : done ? (
        <Workflow className="size-3 shrink-0" />
      ) : (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      )}
      <span className="shrink-0">
        {done ? "Activated skill" : failed ? "Skill activation failed" : "Activating skill"}
      </span>
      {name && <span className="min-w-0 truncate text-muted-foreground/80">{name}</span>}
    </div>
  );
}

function SkillChip({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";
  const input = part.input as { name?: string } | undefined;
  const output = part.output as { id?: string | null; name?: string } | undefined;
  const name = output?.name ?? input?.name;
  const id = output?.id ?? null;

  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      {failed ? (
        <CircleAlert className="size-3 shrink-0 text-destructive" />
      ) : done ? (
        <Workflow className="size-3 shrink-0" />
      ) : (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      )}
      <span className="shrink-0">Drafted skill</span>
      {name && <span className="min-w-0 truncate text-muted-foreground/80">{name}</span>}
      {done && id && (
        <Link
          to="/skills"
          search={{ selected: id }}
          className="shrink-0 rounded-sm border px-1.5 py-0.5 font-medium transition-colors hover:bg-accent hover:text-foreground"
        >
          Review
        </Link>
      )}
    </div>
  );
}

function NewChatSkills() {
  const db = useDb();
  const appendToInput = useAssistantStore((s) => s.appendToInput);
  const requestComposerFocus = useAssistantStore((s) => s.requestComposerFocus);
  const { data: skills } = useDbQuery((db) =>
    db
      .selectFrom("skill")
      .select(["id", "name", "whenToUse"])
      .where("status", "=", "active")
      .orderBy("lastUsedAt", "desc")
      .orderBy("createdAt", "desc"),
  );

  if (skills.length === 0) return null;

  function pick(skill: { id: string; name: string }) {
    db.db.executeKysely((q) => q.updateTable("skill").set({ lastUsedAt: Date.now() }).where("id", "=", skill.id));
    appendToInput(`Use the "${skill.name || "Untitled"}" skill.`);
    requestComposerFocus();
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-1.5">
      <p className="text-muted-foreground text-xs">Or start from a skill</p>
      {skills.map((skill) => (
        <button
          key={skill.id}
          type="button"
          onClick={() => pick(skill)}
          className="flex w-full items-start gap-2 rounded-md border bg-card p-2 text-left transition-colors hover:bg-accent"
        >
          <Workflow className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-sm">{skill.name || "Untitled skill"}</span>
            {skill.whenToUse && <span className="block truncate text-muted-foreground text-xs">{skill.whenToUse}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

function ChartErrorChip() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      <CircleAlert className="size-3 text-destructive" />
      Could not render chart
    </div>
  );
}

function logChartError(error: unknown) {
  console.error("Failed to render assistant chart", error);
}

function MessageParts({ message, conversationId }: { message: UIMessage; conversationId: string }) {
  return message.parts.map((part, i) => {
    if (part.type === "dynamic-tool" || isToolUIPart(part)) {
      const name = part.type === "dynamic-tool" ? part.toolName : getToolName(part);
      if (name === "saveDownload" && part.state === "output-available" && part.output) {
        return <DownloadFileChip key={i} conversationId={conversationId} file={part.output as UploadedWorkspaceFile} />;
      }
      if (name === "web_search" || name === "web_extract") {
        return <WebToolChip key={i} part={part} />;
      }
      if (name === "remember" || name === "update_memory" || name === "forget") {
        return <MemoryChip key={i} part={part} />;
      }
      if (name === "read" || name === "read_skill_resource") {
        return <ReadFileChip key={i} part={part} />;
      }
      if (name === "activate_skill") {
        return <ActivateSkillChip key={i} part={part} />;
      }
      if (name === "create_skill") {
        return <SkillChip key={i} part={part} />;
      }
      if (name === "renderChart" && part.state === "output-available") {
        return (
          <ErrorBoundary key={i} fallback={<ChartErrorChip />} onError={logChartError} resetKeys={[part.input]}>
            <Suspense fallback={<ToolCallChip part={part} />}>
              <ChartCard spec={part.input} />
            </Suspense>
          </ErrorBoundary>
        );
      }
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
      <DropdownMenuContent align="start" className="w-80">
        {conversations.map((conversation) => (
          <DropdownMenuItem
            key={conversation.id}
            className={cn("group gap-2", conversation.id === active.id && "bg-accent")}
            onClick={() => setActiveConversation(conversation.id)}
          >
            <span className="flex-1 truncate">{conversationLabel(conversation)}</span>
            <ConversationDeleteButton
              label={conversationLabel(conversation)}
              onDelete={() => onDeleteConversation(conversation)}
              className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const MODEL_MODALITY_META = {
  audio: { label: "Audio input", Icon: Mic },
  file: { label: "File input", Icon: FileText },
  image: { label: "Image input", Icon: ImageIcon },
  text: { label: "Text input", Icon: Type },
  video: { label: "Video input", Icon: Video },
} satisfies Record<AssistantModelInputModality, { label: string; Icon: typeof Type }>;

function ModelModalityIcons({ modalities }: { modalities: AssistantModelInputModality[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
      {modalities.map((modality) => {
        const { label, Icon } = MODEL_MODALITY_META[modality];
        return (
          <Tooltip key={modality}>
            <TooltipTrigger asChild>
              <span aria-label={label} className="flex size-4 items-center justify-center" role="img" title={label}>
                <Icon className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

function ModelSelect({
  model,
  locked,
  onSelect,
}: {
  model: AssistantModelId;
  locked: boolean;
  onSelect: (model: AssistantModelId) => void;
}) {
  const active = ASSISTANT_MODELS.find((m) => m.id === model) ?? ASSISTANT_MODELS[0];

  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs">
            <Cpu className="size-3.5 shrink-0" />
            <span className="truncate">{active.label}</span>
            <ModelModalityIcons modalities={active.inputModalities} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Model is fixed once the conversation starts</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Select model"
            >
              <Cpu className="size-3.5 shrink-0" />
              <span className="truncate">{active.label}</span>
              <ModelModalityIcons modalities={active.inputModalities} />
              <ChevronDown className="size-3 shrink-0" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{formatModelPricing(active)}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-72">
        {ASSISTANT_MODELS_BY_PRICE.map((m) => (
          <DropdownMenuItem key={m.id} className="items-start gap-2 py-2" onClick={() => onSelect(m.id)}>
            <Cpu className="mt-0.5 size-3.5 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{m.label}</span>
                <ModelModalityIcons modalities={m.inputModalities} />
              </span>
              <span className="truncate text-muted-foreground text-xs">{formatModelPricing(m)}</span>
            </span>
            {m.id === active.id && <Check className="mt-0.5 size-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConversationCost({ conversation }: { conversation: ConversationRow }) {
  if (!conversation.totalCost && !conversation.totalTokens) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
          {formatCost(conversation.totalCost)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {conversation.totalTokens.toLocaleString()} tokens · {formatCost(conversation.totalCost)} this conversation
      </TooltipContent>
    </Tooltip>
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
  const closePanel = useAssistantStore((s) => s.closePanel);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const preferredModel = useAssistantStore((s) => s.model);
  const copyAgentIdResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentIdCopied, setAgentIdCopied] = useState(false);
  const agentId = `user-${auth.userId}:${conversation.id}`;

  useEffect(() => {
    return () => {
      if (copyAgentIdResetRef.current) {
        clearTimeout(copyAgentIdResetRef.current);
      }
    };
  }, []);

  function deleteConversation(target: ConversationRow) {
    db.db.executeKysely((q) => q.deleteFrom("conversation").where("id", "=", target.id));
    if (target.id === conversation.id) {
      const next = conversations.find((c) => c.id !== target.id);
      setActiveConversation(next ? next.id : null);
    }
  }

  const deleteActive = useInlineConfirm({ onConfirm: () => deleteConversation(conversation) });

  async function copyAgentId() {
    await navigator.clipboard.writeText(agentId);
    setAgentIdCopied(true);
    if (copyAgentIdResetRef.current) {
      clearTimeout(copyAgentIdResetRef.current);
    }
    copyAgentIdResetRef.current = setTimeout(() => setAgentIdCopied(false), 1500);
  }

  function newConversation() {
    if (!conversation.title && conversation.totalTokens === 0) return;
    const id = generateId();
    const now = Date.now();
    db.db.executeKysely((q) =>
      q.insertInto("conversation").values({
        id,
        title: "",
        createdAt: now,
        updatedAt: now,
        model: preferredModel,
        tombstone: false,
        totalCost: 0,
        totalTokens: 0,
      }),
    );
    setActiveConversation(id);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <ConversationSwitcher
          conversations={conversations}
          active={conversation}
          onDeleteConversation={deleteConversation}
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
        {auth.userRole === "admin" && (
          <Tooltip open={agentIdCopied || undefined}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label="Copy agent id"
                onClick={copyAgentId}
              >
                {agentIdCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{agentIdCopied ? "Copied agent id" : "Copy agent id"}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip open={deleteActive.armed || undefined}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={deleteActive.armed ? "destructive" : "ghost"}
              size="icon"
              className={cn("size-8", !deleteActive.armed && "text-muted-foreground")}
              aria-label={deleteActive.armed ? "Confirm delete conversation" : "Delete conversation"}
              {...deleteActive.getButtonProps()}
            >
              {deleteActive.pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {deleteActive.armed ? "Click again to delete" : "Delete conversation"}
          </TooltipContent>
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

      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center bg-background">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ConversationChat agentId={agentId} conversation={conversation} />
      </Suspense>
    </div>
  );
}

function ConversationChat({ agentId, conversation }: { agentId: string; conversation: ConversationRow }) {
  const db = useDb();
  const input = useAssistantStore((s) => s.inputDraft);
  const setInput = useAssistantStore((s) => s.setInputDraft);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerFocusNonce = useAssistantStore((s) => s.composerFocusNonce);

  // Pull focus back to the composer when something requests it (e.g. attaching
  // context from a card elsewhere on the page). rAF lets the sidebar mount first.
  useEffect(() => {
    if (composerFocusNonce === 0) return;
    const frame = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
    return () => cancelAnimationFrame(frame);
  }, [composerFocusNonce]);

  const setPreferredModel = useAssistantStore((s) => s.setModel);
  const model = resolveAssistantModelId(conversation.model);
  const modelRef = useRef(model);
  modelRef.current = model;

  const agent = useAgent({ agent: "assistant-agent", name: agentId });
  const { messages, sendMessage, status, stop, error, isServerStreaming } = useAgentChat({
    agent,
    body: () => ({ model: modelRef.current }),
  });

  function selectModel(next: AssistantModelId) {
    setPreferredModel(next);
    db.db.executeKysely((q) => q.updateTable("conversation").set({ model: next }).where("id", "=", conversation.id));
  }
  const isWorking = uploading || status === "submitted" || status === "streaming" || isServerStreaming;

  async function uploadSelectedFiles() {
    if (selectedFiles.length === 0) return [];

    const formData = new FormData();
    formData.set("conversationId", conversation.id);
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    const response = await fetch("/api/assistant/upload", {
      method: "POST",
      body: formData,
    });
    const body = (await response.json().catch(() => null)) as {
      files?: UploadedWorkspaceFile[];
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Upload failed.");
    }
    return body?.files ?? [];
  }

  async function submit() {
    const text = input.trim();
    if ((!text && selectedFiles.length === 0) || isWorking) return;

    setUploadError(null);
    let uploadedFiles: UploadedWorkspaceFile[] = [];
    if (selectedFiles.length > 0) {
      setUploading(true);
      try {
        uploadedFiles = await uploadSelectedFiles();
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Upload failed.");
        return;
      } finally {
        setUploading(false);
      }
    }

    const workspaceContext =
      uploadedFiles.length > 0
        ? [
            "Uploaded files are available in the agent workspace:",
            ...uploadedFiles.map((file) => `- ${file.filename}: ${file.path} (${file.mediaType}, ${file.size} bytes)`),
          ].join("\n")
        : "";
    const messageText = [text, workspaceContext].filter(Boolean).join("\n\n");

    sendMessage({ text: messageText });
    if (messages.length === 0) {
      db.db.executeKysely((q) =>
        q
          .updateTable("conversation")
          .set({
            title: (text || selectedFiles.map((file) => file.name).join(", ")).slice(0, 80),
          })
          .where("id", "=", conversation.id),
      );
    }
    setInput("");
    setSelectedFiles([]);
  }

  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = getPastedImageFiles(event);
    if (files.length === 0) return;

    event.preventDefault();
    setUploadError(null);
    setSelectedFiles((current) => [...current, ...files].slice(0, MAX_UPLOAD_FILES));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <StickToBottom className="relative min-h-0 flex-1 overflow-y-auto" resize="smooth" initial="instant">
        <StickToBottom.Content className="flex flex-col gap-4 p-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                <Sparkles className="size-6" />
                <p className="text-sm">Ask anything about your notes, accounts, or plans.</p>
              </div>
              <NewChatSkills />
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "min-w-0 space-y-2 text-sm",
                message.role === "user" &&
                  "ml-8 self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground selection:bg-primary-foreground/30 selection:text-primary",
              )}
            >
              <MessageParts message={message} conversationId={conversation.id} />
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

      {(error || uploadError) && (
        <div className="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {uploadError ?? error?.message ?? "Something went wrong. Try again."}
        </div>
      )}

      <form
        className="flex shrink-0 flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            setSelectedFiles((current) => [...current, ...files].slice(0, MAX_UPLOAD_FILES));
            event.target.value = "";
          }}
        />
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${file.lastModified}-${index}`}
                className="flex max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs"
              >
                <span className="max-w-40 truncate">{file.name}</span>
                <span className="shrink-0">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-accent hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setSelectedFiles((files) => files.filter((_, i) => i !== index))}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <ModelSelect model={model} locked={messages.length > 0} onSelect={selectModel} />
          <ConversationCost conversation={conversation} />
        </div>
        <div className="flex min-w-0 items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Attach files"
            disabled={isWorking || selectedFiles.length >= MAX_UPLOAD_FILES}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={pasteImages}
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
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <CircleStop className="size-4" />}
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="shrink-0"
              aria-label="Send message"
              disabled={!input.trim() && selectedFiles.length === 0}
            >
              <SendHorizontal className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Opens the assistant on a fresh conversation. Reuses an existing blank
 * conversation rather than piling up empty stubs (mirrors the guard in
 * ConversationView.newConversation). Used by the command palette.
 */
export function useNewConversation() {
  const db = useDb();
  const openPanel = useAssistantStore((s) => s.openPanel);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const preferredModel = useAssistantStore((s) => s.model);

  return useCallback(() => {
    openPanel("assistant");

    const [empty] = db.db.executeKysely((q) =>
      q
        .selectFrom("conversation")
        .select("id")
        .where("tombstone", "=", false)
        .where("title", "=", "")
        .where("totalTokens", "=", 0)
        .orderBy("updatedAt", "desc")
        .limit(1),
    ).rows;
    if (empty) {
      setActiveConversation(empty.id);
      return;
    }

    const id = generateId();
    const now = Date.now();
    db.db.executeKysely((q) =>
      q.insertInto("conversation").values({
        id,
        title: "",
        createdAt: now,
        updatedAt: now,
        model: preferredModel,
        tombstone: false,
        totalCost: 0,
        totalTokens: 0,
      }),
    );
    setActiveConversation(id);
  }, [db, openPanel, setActiveConversation, preferredModel]);
}

export function AssistantSidebar() {
  const db = useDb();
  const activeConversationId = useAssistantStore((s) => s.activeConversationId);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const preferredModel = useAssistantStore((s) => s.model);

  const { data: conversations } = useDbQuery((db) =>
    db
      .selectFrom("conversation")
      .selectAll()
      .where(sql<boolean>`${activeConversationId ?? ""} is not null`)
      .orderBy("updatedAt", "desc"),
  );

  const active = conversations.find((c) => c.id === activeConversationId) ?? conversations[0];

  const creatingRef = useRef(false);
  useEffect(() => {
    if (conversations.length > 0) {
      creatingRef.current = false;
      return;
    }
    if (creatingRef.current) return;
    creatingRef.current = true;
    const id = generateId();
    const now = Date.now();
    db.db.executeKysely((q) =>
      q.insertInto("conversation").values({
        id,
        title: "",
        createdAt: now,
        updatedAt: now,
        model: preferredModel,
        tombstone: false,
        totalCost: 0,
        totalTokens: 0,
      }),
    );
    setActiveConversation(id);
  }, [conversations, db, setActiveConversation, preferredModel]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ConversationView key={active.id} conversation={active} conversations={conversations} />;
}
