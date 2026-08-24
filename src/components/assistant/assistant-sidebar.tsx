import { generateId } from "@sqlite-sync/core";
import { formatForDisplay } from "@tanstack/hotkeys";
import { Link } from "@tanstack/react-router";
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
  type AssistantReasoningEffort,
  formatReasoningEffortLabel,
  GPT_5_6_REASONING_EFFORTS,
  getAssistantModel,
  modelSupportsSelectableReasoning,
  resolveAssistantModelId,
  resolveAssistantReasoningEffort,
} from "@/agent/models";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth } from "@/lib/auth-client";
import { TOGGLE_ASSISTANT_HOTKEY } from "@/lib/hotkeys";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc/orpc-client";
import type { ConversationItem, ConversationMessageItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";
import { useConfirmDialogStore } from "../confirm-dialog";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { useInlineConfirm } from "../ui/inline-confirm";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type ConversationRow = ConversationItem;
type ConversationIdentity = Pick<ConversationRow, "id" | "title">;

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

function preferredConversationReasoningEffort(
  modelId: AssistantModelId,
  preferred: unknown,
): AssistantReasoningEffort | null {
  if (!modelSupportsSelectableReasoning(modelId)) return null;
  return resolveAssistantReasoningEffort(modelId, preferred) ?? null;
}

function rpcErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

function shouldReleaseAwaitingTurn(input: {
  turnStatus: ConversationRow["turnStatus"];
  updatedAt: number;
  submittedUpdatedAt: number;
}): boolean {
  if (input.turnStatus !== "idle") return true;
  return input.updatedAt !== input.submittedUpdatedAt;
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

function ToolCallChip({ name, failed }: { name: string; failed: boolean }) {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      {failed ? <CircleAlert className="size-3 text-destructive" /> : <Check className="size-3" />}
      <span className="font-mono">{name}</span>
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

function parseJson(data: string): unknown {
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

type ToolLink = { title?: string | null; url: string };
type WebToolPayload = {
  query?: string;
  answer?: string;
  urlCount?: number;
  results?: ToolLink[];
  failedResults?: ToolLink[];
};
type MemoryToolPayload = { content?: string };
type ReadToolPayload = { path?: string };
type SkillToolPayload = { id?: string | null; name?: string };

function toolPayload<T>(data: string): T {
  return (parseJson(data) ?? {}) as T;
}

function toolLinks(value: ToolLink[] | undefined): ToolLink[] {
  return Array.isArray(value) ? value.filter((link) => typeof link?.url === "string") : [];
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourceLink({ url, title }: ToolLink) {
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

function WebToolDetails({ name, payload }: { name: string; payload: WebToolPayload }) {
  const results = toolLinks(payload.results);

  if (name === "web_search") {
    return (
      <div className="flex max-w-sm flex-col gap-1">
        {payload.answer && <p className="line-clamp-6 px-1 text-muted-foreground">{payload.answer}</p>}
        {results.map((result) => (
          <SourceLink key={result.url} url={result.url} title={result.title} />
        ))}
        {results.length === 0 && !payload.answer && <p className="px-1 text-muted-foreground">No results.</p>}
      </div>
    );
  }

  const failedResults = toolLinks(payload.failedResults);
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

function WebToolChip({ name, failed, data }: { name: string; failed: boolean; data: string }) {
  const [open, setOpen] = useState(false);
  const payload = toolPayload<WebToolPayload>(data);
  const Icon = name === "web_search" ? Search : FileText;
  const summary =
    name === "web_search"
      ? payload.query
      : payload.urlCount
        ? `${payload.urlCount} ${payload.urlCount === 1 ? "page" : "pages"}`
        : undefined;

  return (
    <div className="w-fit max-w-full overflow-hidden rounded-md border bg-muted/50 text-xs">
      <button
        type="button"
        disabled={failed}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1 text-muted-foreground",
          !failed && "hover:text-foreground",
        )}
      >
        {failed ? <CircleAlert className="size-3 shrink-0 text-destructive" /> : <Icon className="size-3 shrink-0" />}
        <span className="font-mono">{name}</span>
        {summary && <span className="min-w-0 truncate text-muted-foreground/80">{summary}</span>}
        {!failed && <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />}
      </button>
      {open && !failed && (
        <div className="border-t px-2 py-1.5">
          <WebToolDetails name={name} payload={payload} />
        </div>
      )}
    </div>
  );
}

function MemoryChip({ name, failed, data }: { name: string; failed: boolean; data: string }) {
  const payload = toolPayload<MemoryToolPayload>(data);
  const label = name === "forget" ? "Forgot a memory" : name === "update_memory" ? "Updated a memory" : "Remembered";

  return (
    <Link
      to="/memories"
      className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
    >
      {failed ? <CircleAlert className="size-3 shrink-0 text-destructive" /> : <Brain className="size-3 shrink-0" />}
      <span className="shrink-0">{label}</span>
      {name !== "forget" && payload.content && (
        <span className="min-w-0 truncate text-muted-foreground/80">{payload.content}</span>
      )}
    </Link>
  );
}

function resourceFilename(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").at(-1) || path;
}

function ReadFileChip({ failed, data }: { failed: boolean; data: string }) {
  const { path } = toolPayload<ReadToolPayload>(data);
  const filename = path ? resourceFilename(path) : undefined;

  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      {failed ? <CircleAlert className="size-3 shrink-0 text-destructive" /> : <FileText className="size-3 shrink-0" />}
      <span className="shrink-0">{failed ? "Read failed" : "Read file"}</span>
      {filename && <span className="min-w-0 truncate text-muted-foreground/80">{filename}</span>}
    </div>
  );
}

function ActivateSkillChip({ failed, data }: { failed: boolean; data: string }) {
  const { name: skillId } = toolPayload<SkillToolPayload>(data);
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
      {failed ? <CircleAlert className="size-3 shrink-0 text-destructive" /> : <Workflow className="size-3 shrink-0" />}
      <span className="shrink-0">{failed ? "Skill activation failed" : "Activated skill"}</span>
      {name && <span className="min-w-0 truncate text-muted-foreground/80">{name}</span>}
    </div>
  );
}

function SkillChip({ failed, data }: { failed: boolean; data: string }) {
  const { id, name } = toolPayload<SkillToolPayload>(data);

  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      {failed ? <CircleAlert className="size-3 shrink-0 text-destructive" /> : <Workflow className="size-3 shrink-0" />}
      <span className="shrink-0">Drafted skill</span>
      {name && <span className="min-w-0 truncate text-muted-foreground/80">{name}</span>}
      {!failed && id && (
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

function downloadFileFromData(data: string): UploadedWorkspaceFile | null {
  const parsed = parseJson(data);
  if (!parsed || typeof parsed !== "object") return null;
  const file = parsed as Partial<UploadedWorkspaceFile>;
  if (typeof file.filename !== "string" || typeof file.path !== "string") return null;
  return {
    filename: file.filename,
    mediaType: typeof file.mediaType === "string" ? file.mediaType : "application/octet-stream",
    size: typeof file.size === "number" ? file.size : 0,
    path: file.path,
  };
}

type MessageGroup = { role: ConversationMessageItem["role"]; messages: ConversationMessageItem[] };

function groupMessageRows(messages: ConversationMessageItem[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const open = groups.at(-1);
    if (message.role === "assistant" && open?.role === "assistant") {
      open.messages.push(message);
    } else {
      groups.push({ role: message.role, messages: [message] });
    }
  }
  return groups;
}

function MessageRow({ message, conversationId }: { message: ConversationMessageItem; conversationId: string }) {
  if (message.kind === "tool") {
    const { toolName, data } = message;
    const failed = message.toolState === "error";
    if (toolName === "saveDownload" && !failed) {
      const file = downloadFileFromData(data);
      if (file) return <DownloadFileChip conversationId={conversationId} file={file} />;
    }
    if (toolName === "web_search" || toolName === "web_extract") {
      return <WebToolChip name={toolName} failed={failed} data={data} />;
    }
    if (toolName === "remember" || toolName === "update_memory" || toolName === "forget") {
      return <MemoryChip name={toolName} failed={failed} data={data} />;
    }
    if (toolName === "read" || toolName === "read_skill_resource") {
      return <ReadFileChip failed={failed} data={data} />;
    }
    if (toolName === "activate_skill") {
      return <ActivateSkillChip failed={failed} data={data} />;
    }
    if (toolName === "create_skill") {
      return <SkillChip failed={failed} data={data} />;
    }
    if (toolName === "renderChart" && !failed) {
      const spec = parseJson(data);
      return (
        <ErrorBoundary fallback={<ChartErrorChip />} onError={logChartError} resetKeys={[data]}>
          <Suspense fallback={<ToolCallChip name={toolName} failed={false} />}>
            <ChartCard spec={spec} />
          </Suspense>
        </ErrorBoundary>
      );
    }
    return <ToolCallChip name={toolName || "tool"} failed={failed} />;
  }

  if (!message.text) return null;

  if (message.role === "user") {
    return <div className="whitespace-pre-wrap break-words">{message.text}</div>;
  }

  return <Streamdown>{message.text}</Streamdown>;
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

function conversationLabel(conversation: ConversationIdentity) {
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
  active: ConversationIdentity;
  onDeleteConversation: (conversation: ConversationRow) => Promise<void> | void;
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

function ReasoningEffortSelect({
  effort,
  locked,
  onSelect,
}: {
  effort: AssistantReasoningEffort;
  locked: boolean;
  onSelect: (effort: AssistantReasoningEffort) => void;
}) {
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs">
            <Brain className="size-3.5 shrink-0" />
            <span className="truncate">{formatReasoningEffortLabel(effort)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Reasoning effort is fixed once the conversation starts</TooltipContent>
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
              aria-label="Select reasoning effort"
            >
              <Brain className="size-3.5 shrink-0" />
              <span className="truncate">{formatReasoningEffortLabel(effort)}</span>
              <ChevronDown className="size-3 shrink-0" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Reasoning effort</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-40">
        {GPT_5_6_REASONING_EFFORTS.map((level) => (
          <DropdownMenuItem key={level} className="gap-2" onClick={() => onSelect(level)}>
            <span className="flex-1">{formatReasoningEffortLabel(level)}</span>
            {level === effort && <Check className="size-3.5 shrink-0" />}
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

type ConversationTarget =
  | { kind: "draft"; conversationId: string }
  | { kind: "persisted"; conversation: ConversationRow };

function ConversationView({ target, conversations }: { target: ConversationTarget; conversations: ConversationRow[] }) {
  const auth = useAuth();
  const closePanel = useAssistantStore((s) => s.closePanel);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const copyAgentIdResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentIdCopied, setAgentIdCopied] = useState(false);
  const conversation = target.kind === "persisted" ? target.conversation : null;
  const conversationId = target.kind === "persisted" ? target.conversation.id : target.conversationId;
  const active = conversation ?? ({ id: conversationId, title: "" } satisfies ConversationIdentity);
  const agentId = `user-${auth.userId}:${conversationId}`;

  useEffect(() => {
    return () => {
      if (copyAgentIdResetRef.current) {
        clearTimeout(copyAgentIdResetRef.current);
      }
    };
  }, []);

  async function deleteConversation(target: ConversationRow) {
    await orpc.assistant.deleteConversation.call({ conversationId: target.id });
    if (target.id === conversation?.id) {
      const next = conversations.find((c) => c.id !== target.id);
      setActiveConversation(next?.id ?? generateId());
    }
  }

  const deleteActive = useInlineConfirm({
    onConfirm: () => (conversation ? deleteConversation(conversation) : undefined),
  });

  async function copyAgentId() {
    await navigator.clipboard.writeText(agentId);
    setAgentIdCopied(true);
    if (copyAgentIdResetRef.current) {
      clearTimeout(copyAgentIdResetRef.current);
    }
    copyAgentIdResetRef.current = setTimeout(() => setAgentIdCopied(false), 1500);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <ConversationSwitcher conversations={conversations} active={active} onDeleteConversation={deleteConversation} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="New conversation"
              onClick={() => setActiveConversation(generateId())}
            >
              <PlusIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New conversation</TooltipContent>
        </Tooltip>
        {conversation && auth.userRole === "admin" && (
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
        {conversation && (
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
        )}
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
        <ConversationChat target={target} />
      </Suspense>
    </div>
  );
}

function ConversationChat({ target }: { target: ConversationTarget }) {
  const conversation = target.kind === "persisted" ? target.conversation : null;
  const conversationId = target.kind === "persisted" ? target.conversation.id : target.conversationId;
  const isDesktop = useIsDesktop();
  const input = useAssistantStore((s) => s.inputDraft);
  const setInput = useAssistantStore((s) => s.setInputDraft);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConversation, setAwaitingConversation] = useState(false);
  const [pendingSubmittedUpdatedAt, setPendingSubmittedUpdatedAt] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ensuredRef = useRef(false);
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

  const { data: messages } = useDbQuery((db) =>
    db
      .selectFrom("conversation_message")
      .selectAll()
      .where("conversationId", "=", conversationId)
      .orderBy("seq", "asc")
      .orderBy("id", "asc"),
  );

  // Once the conversation row syncs down, isRunning drives the working state; drop the
  // optimistic bridge flag so the composer doesn't stay locked after the first turn.
  useEffect(() => {
    if (conversation) setAwaitingConversation(false);
  }, [conversation]);

  // Opening the sidebar does not wake the agent. Ping it so onStart can copy a
  // pre-sqlite transcript into conversation_message. Skip brand-new empty chats.
  useEffect(() => {
    if (!conversation) return;
    if (ensuredRef.current || messages.length > 0) return;
    if (!conversation.title && conversation.totalTokens === 0) return;
    ensuredRef.current = true;
    orpc.assistant.ensureProjection.call({ conversationId: conversation.id }).catch((error: unknown) => {
      console.error("Failed to backfill conversation", error);
      ensuredRef.current = false;
    });
  }, [conversation, messages.length]);

  const preferredModel = useAssistantStore((s) => s.model);
  const setPreferredModel = useAssistantStore((s) => s.setModel);
  const preferredReasoningEffort = useAssistantStore((s) => s.reasoningEffort);
  const setPreferredReasoningEffort = useAssistantStore((s) => s.setReasoningEffort);
  const model = conversation ? resolveAssistantModelId(conversation.model) : preferredModel;
  const reasoningEffort =
    resolveAssistantReasoningEffort(model, conversation?.reasoningEffort ?? preferredReasoningEffort) ??
    getAssistantModel(model)?.reasoningEffort ??
    "medium";

  function selectModel(next: AssistantModelId) {
    setPreferredModel(next);
  }

  function selectReasoningEffort(next: AssistantReasoningEffort) {
    setPreferredReasoningEffort(next);
  }

  const isRunning = conversation?.turnStatus === "running";
  // Follow-up `submitTurn` returns before the `turnStatus: "running"` write arrives
  // on the client websocket. Hold the composer until that write, or a later
  // idle/error with a newer `updatedAt`, is visible.
  const awaitingTurn =
    pendingSubmittedUpdatedAt != null &&
    (conversation == null ||
      !shouldReleaseAwaitingTurn({
        turnStatus: conversation.turnStatus,
        updatedAt: conversation.updatedAt,
        submittedUpdatedAt: pendingSubmittedUpdatedAt,
      }));
  const isWorking = uploading || submitting || awaitingConversation || awaitingTurn || isRunning;
  const canStop = isRunning || awaitingTurn;
  const locked = conversation !== null || awaitingConversation;
  const turnError = conversation?.turnStatus === "error" ? conversation.turnError : "";

  async function uploadSelectedFiles() {
    if (selectedFiles.length === 0) return [];

    const formData = new FormData();
    formData.set("conversationId", conversationId);
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
    setRpcError(null);
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

    setSubmitting(true);
    try {
      if (conversation) {
        const submittedUpdatedAt = conversation.updatedAt;
        await orpc.assistant.submitTurn.call({
          conversationId,
          turnId: generateId(),
          text: messageText,
        });
        setPendingSubmittedUpdatedAt(submittedUpdatedAt);
      } else {
        const result = await orpc.assistant.startConversation.call({
          conversationId,
          text: messageText,
          model,
          reasoningEffort: preferredConversationReasoningEffort(model, preferredReasoningEffort),
        });
        setAwaitingConversation(true);
        setActiveConversation(result.conversationId);
      }
      setInput("");
      setSelectedFiles([]);
    } catch (error) {
      setPendingSubmittedUpdatedAt(null);
      setAwaitingConversation(false);
      setRpcError(rpcErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!canStop) return;
    try {
      await orpc.assistant.cancelTurn.call({ conversationId });
      setPendingSubmittedUpdatedAt(null);
    } catch (error) {
      setRpcError(rpcErrorMessage(error));
    }
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
          {groupMessageRows(messages).map((group) => (
            <div
              key={group.messages[0].id}
              className={cn(
                "min-w-0 space-y-2 text-sm",
                group.role === "user" &&
                  "ml-8 self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground selection:bg-primary-foreground/30 selection:text-primary",
              )}
            >
              {group.messages.map((message) => (
                <MessageRow key={message.id} message={message} conversationId={conversationId} />
              ))}
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

      {(rpcError || uploadError || turnError) && (
        <div className="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {uploadError ?? rpcError ?? turnError}
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
          <div className="flex min-w-0 items-center gap-1">
            <ModelSelect model={model} locked={locked} onSelect={selectModel} />
            {modelSupportsSelectableReasoning(model) && (
              <ReasoningEffortSelect effort={reasoningEffort} locked={locked} onSelect={selectReasoningEffort} />
            )}
          </div>
          {conversation && <ConversationCost conversation={conversation} />}
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
              if (isDesktop && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Send a message…"
            rows={2}
            className="max-h-40 min-h-0 flex-1 resize-none"
          />
          {canStop ? (
            <Button type="button" variant="secondary" size="icon" aria-label="Stop generating" onClick={() => cancel()}>
              <CircleStop className="size-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="shrink-0"
              aria-label="Send message"
              disabled={isWorking || (!input.trim() && selectedFiles.length === 0)}
            >
              {uploading || submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizontal className="size-4" />
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Opens the assistant with an unpersisted conversation draft. */
export function useNewConversation() {
  const openPanel = useAssistantStore((s) => s.openPanel);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);

  return useCallback(() => {
    openPanel("assistant");
    setActiveConversation(generateId());
  }, [openPanel, setActiveConversation]);
}

export function AssistantSidebar() {
  const activeConversationId = useAssistantStore((s) => s.activeConversationId);
  const [fallbackDraftId] = useState(generateId);

  const { data: conversations } = useDbQuery((db) =>
    db.selectFrom("conversation").selectAll().orderBy("updatedAt", "desc"),
  );

  const selectedConversationId = activeConversationId ?? conversations[0]?.id ?? fallbackDraftId;
  const active = conversations.find((conversation) => conversation.id === selectedConversationId);
  const target: ConversationTarget = active
    ? { kind: "persisted", conversation: active }
    : { kind: "draft", conversationId: selectedConversationId };

  return <ConversationView key={selectedConversationId} target={target} conversations={conversations} />;
}
