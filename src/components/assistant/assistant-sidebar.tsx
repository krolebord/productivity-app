import { generateId } from "@sqlite-sync/core";
import { useMutation } from "@tanstack/react-query";
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
  Gauge,
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
import { BUILTIN_SKILLS, findBuiltinSkill, isBuiltinSkillId } from "@/agent/builtin-skills";
import { conversationTurnFilesFromData } from "@/agent/conversation-projection";
import {
  ASSISTANT_MODELS,
  ASSISTANT_MODELS_BY_PRICE,
  type AssistantModel,
  type AssistantModelId,
  type AssistantModelInputModality,
  type AssistantReasoningEffort,
  formatReasoningEffortLabel,
  getAssistantModel,
  getModelReasoningEfforts,
  modelSupportsSelectableReasoning,
  resolveAssistantModelId,
  resolveAssistantReasoningEffort,
} from "@/agent/models";
import { AssistantHeaderActions } from "@/components/assistant/assistant-header-actions";
import { ChatsBackButton, ConversationList } from "@/components/assistant/conversation-list";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, uploadTotalBytes } from "@/lib/assistant-files";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth } from "@/lib/auth-client";
import { conversationTitle } from "@/lib/conversation-list";
import {
  isSubmitLockHolding,
  type SubmitLock,
  shouldClearComposerAfterSubmit,
  shouldClearSubmitLockOnError,
} from "@/lib/submit-lock";
import { useAssistantNavigation } from "@/lib/use-assistant-navigation";
import { useAssistantSurface, useIsAssistantPage } from "@/lib/use-assistant-surface";
import { useBottomInset } from "@/lib/use-bottom-inset";
import { useCatchUpConversationLastReadAt } from "@/lib/use-catch-up-conversation-last-read";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc/orpc-client";
import type { ConversationItem, ConversationMessageItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";
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

// Recharts is heavy; keep it out of the main bundle until a chart is rendered.
const ChartCard = lazy(() => import("./chart-card"));
const TransactionsCard = lazy(() => import("./transactions-card"));

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

/** Artificial Analysis intelligence index, when the model reports one. */
function ModelIntelligenceScore({ score }: { score: number | undefined }) {
  if (score == null) return null;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex shrink-0 items-center gap-0.5 tabular-nums" />}>
        <Gauge className="size-3 shrink-0" />
        {score}
      </TooltipTrigger>
      <TooltipContent side="bottom">Artificial Analysis intelligence index</TooltipContent>
    </Tooltip>
  );
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
  const { data: userSkills } = useDbQuery((db) =>
    db
      .selectFrom("skill")
      .select(["id", "name", "whenToUse"])
      .where("status", "=", "active")
      .orderBy("lastUsedAt", "desc")
      .orderBy("createdAt", "desc"),
  );

  const builtinSkills = BUILTIN_SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    whenToUse: skill.whenToUse,
  }));
  const skills = [...userSkills, ...builtinSkills];

  if (skills.length === 0) return null;

  function pick(skill: { id: string; name: string }) {
    if (!isBuiltinSkillId(skill.id)) {
      db.db.executeKysely((q) => q.updateTable("skill").set({ lastUsedAt: Date.now() }).where("id", "=", skill.id));
    }
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
  const builtin = skillId ? findBuiltinSkill(skillId) : undefined;
  const { data: skills } = useDbQuery((db) =>
    db
      .selectFrom("skill")
      .select(["id", "name"])
      .where("id", "=", builtin ? "" : (skillId ?? ""))
      .limit(1),
  );
  const name = builtin ? builtin.name : skills[0] ? skills[0].name || "Untitled skill" : skillId;

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
    if (toolName === "renderTransactions" && !failed) {
      const spec = parseJson(data);
      return (
        <ErrorBoundary
          fallback={<ToolCallChip name={toolName} failed={false} />}
          onError={logChartError}
          resetKeys={[data]}
        >
          <Suspense fallback={<ToolCallChip name={toolName} failed={false} />}>
            <TransactionsCard spec={spec} />
          </Suspense>
        </ErrorBoundary>
      );
    }
    return <ToolCallChip name={toolName || "tool"} failed={failed} />;
  }

  if (message.role === "user") {
    const files = conversationTurnFilesFromData(message.data);
    if (!message.text && files.length === 0) return null;
    return (
      <div className="space-y-2">
        {message.text ? <div className="whitespace-pre-wrap break-words">{message.text}</div> : null}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((file) => (
              <span
                key={file.path}
                className="flex max-w-full items-center gap-1.5 rounded-md border border-primary-foreground/25 bg-primary-foreground/10 px-2 py-1 text-xs"
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="max-w-40 truncate">{file.filename}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!message.text) return null;

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
            <TooltipTrigger
              render={
                <span aria-label={label} className="flex size-4 items-center justify-center" role="img" title={label} />
              }
            >
              <Icon className="size-3.5" />
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
  const active = getAssistantModel(model) ?? ASSISTANT_MODELS[0];

  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs" />
          }
        >
          <Cpu className="size-3.5 shrink-0" />
          <span className="truncate">{active.label}</span>
          <ModelModalityIcons modalities={active.inputModalities} />
        </TooltipTrigger>
        <TooltipContent side="bottom">Model is fixed once the conversation starts</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Select model"
                />
              }
            />
          }
        >
          <Cpu className="size-3.5 shrink-0" />
          <span className="truncate">{active.label}</span>
          <ModelModalityIcons modalities={active.inputModalities} />
          <ChevronDown className="size-3 shrink-0" />
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
                {m.id === active.id && <Check className="ml-auto size-3.5 shrink-0" />}
              </span>
              <span className="flex min-w-0 items-center justify-between gap-2 text-muted-foreground text-xs">
                <span className="truncate">{formatModelPricing(m)}</span>
                <ModelIntelligenceScore score={m.intelligenceScore} />
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReasoningEffortSelect({
  effort,
  efforts,
  locked,
  onSelect,
}: {
  effort: AssistantReasoningEffort;
  efforts: readonly AssistantReasoningEffort[];
  locked: boolean;
  onSelect: (effort: AssistantReasoningEffort) => void;
}) {
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs" />
          }
        >
          <Brain className="size-3.5 shrink-0" />
          <span className="truncate">{formatReasoningEffortLabel(effort)}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Reasoning effort is fixed once the conversation starts</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Select reasoning effort"
                />
              }
            />
          }
        >
          <Brain className="size-3.5 shrink-0" />
          <span className="truncate">{formatReasoningEffortLabel(effort)}</span>
          <ChevronDown className="size-3 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Reasoning effort</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-40">
        {efforts.map((level) => (
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
      <TooltipTrigger render={<span className="shrink-0 px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums" />}>
        {formatCost(conversation.totalCost)}
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

function ConversationView({
  target,
  conversations,
  onDeleteConversation,
}: {
  target: ConversationTarget;
  conversations: ConversationRow[];
  onDeleteConversation: (conversation: { id: string }) => Promise<void> | void;
}) {
  const auth = useAuth();
  const { openConversation } = useAssistantNavigation();
  const copyAgentIdResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentIdCopied, setAgentIdCopied] = useState(false);
  const [copyTooltipOpen, setCopyTooltipOpen] = useState(false);
  const [deleteTooltipOpen, setDeleteTooltipOpen] = useState(false);
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

  const deleteActive = useInlineConfirm({
    onConfirm: () => (conversation ? onDeleteConversation(conversation) : undefined),
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
        <ChatsBackButton conversations={conversations} activeConversationId={conversationId} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="truncate font-semibold text-sm">{conversationTitle(active)}</span>
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
                onClick={() => openConversation(generateId())}
              />
            }
          >
            <PlusIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">New conversation</TooltipContent>
        </Tooltip>
        {conversation && auth.userRole === "admin" && (
          <Tooltip open={agentIdCopied || copyTooltipOpen} onOpenChange={setCopyTooltipOpen}>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label="Copy agent id"
                  onClick={copyAgentId}
                />
              }
            >
              {agentIdCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </TooltipTrigger>
            <TooltipContent side="bottom">{agentIdCopied ? "Copied agent id" : "Copy agent id"}</TooltipContent>
          </Tooltip>
        )}
        {conversation && (
          <Tooltip open={deleteActive.armed || deleteTooltipOpen} onOpenChange={setDeleteTooltipOpen}>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant={deleteActive.armed ? "destructive" : "ghost"}
                  size="icon"
                  className={cn("size-8", !deleteActive.armed && "text-muted-foreground")}
                  aria-label={deleteActive.armed ? "Confirm delete conversation" : "Delete conversation"}
                  {...deleteActive.getButtonProps()}
                />
              }
            >
              {deleteActive.pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {deleteActive.armed ? "Click again to delete" : "Delete conversation"}
            </TooltipContent>
          </Tooltip>
        )}
        <AssistantHeaderActions />
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

const AGENT_WARM_INTERVAL_MS = 60_000;

// Composer activity means a send is likely soon: wake the agent so its cold start overlaps
// typing instead of delaying the submit. Drafts benefit most, since their first call creates
// the agent's Durable Object. Pass null to skip warming.
function useWarmAgent(conversationId: string | null) {
  const lastWarmAtRef = useRef(0);
  return useCallback(() => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastWarmAtRef.current < AGENT_WARM_INTERVAL_MS) return;
    lastWarmAtRef.current = now;
    orpc.assistant.ensureProjection.call({ conversationId }).catch(() => {
      lastWarmAtRef.current = 0;
    });
  }, [conversationId]);
}

function ConversationChat({ target }: { target: ConversationTarget }) {
  const conversation = target.kind === "persisted" ? target.conversation : null;
  const conversationId = target.kind === "persisted" ? target.conversation.id : target.conversationId;
  const isDesktop = useIsDesktop();
  const isPage = useIsAssistantPage();
  const composerRef = useBottomInset<HTMLFormElement>(isPage);
  const input = useAssistantStore((s) => s.inputDraft);
  const setInput = useAssistantStore((s) => s.setInputDraft);
  const submitLock = useAssistantStore((s) => s.submitLocks[conversationId]);
  const setSubmitLock = useAssistantStore((s) => s.setSubmitLock);
  const clearSubmitLock = useAssistantStore((s) => s.clearSubmitLock);
  const submitTurn = useMutation({
    ...orpc.assistant.submitTurn.mutationOptions(),
    scope: { id: conversationId },
  });
  const startConversation = useMutation({
    ...orpc.assistant.startConversation.mutationOptions(),
    scope: { id: conversationId },
  });
  const cancelTurn = useMutation(orpc.assistant.cancelTurn.mutationOptions());
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  const hasMessage = submitLock != null && messages.some((message) => message.id === submitLock.messageId);
  // Hold until this submit's user row is visible, then until turnStatus catches up
  // (running/error, or idle with a newer updatedAt). First sends have no baseline.
  const lockHolding = isSubmitLockHolding({ lock: submitLock, conversation, hasMessage });
  const isWorking = lockHolding || isRunning;
  const canStop = isRunning || (lockHolding && conversation !== null);
  const locked = conversation !== null || submitLock != null;
  const turnError = conversation?.turnStatus === "error" ? conversation.turnError : "";
  const warmAgent = useWarmAgent(isWorking ? null : conversationId);

  function releaseOwnedLock(owned: SubmitLock) {
    if (
      shouldClearSubmitLockOnError({
        current: useAssistantStore.getState().submitLocks[conversationId],
        owned,
      })
    ) {
      clearSubmitLock(conversationId);
    }
  }

  function submit() {
    const text = input.trim();
    if ((!text && selectedFiles.length === 0) || isWorking) return;
    if (useAssistantStore.getState().submitLocks[conversationId]) return;

    setUploadError(null);
    setRpcError(null);
    if (uploadTotalBytes(selectedFiles) > MAX_UPLOAD_BYTES) {
      setUploadError("Combined upload is too large.");
      return;
    }

    const files = selectedFiles;
    const lock: SubmitLock = {
      kind: "sync",
      messageId: generateId(),
      submittedUpdatedAt: conversation?.updatedAt ?? null,
    };
    setSubmitLock(conversationId, lock);

    const onSuccess = (result: { accepted: boolean }) => {
      if (!result.accepted) {
        releaseOwnedLock(lock);
        return;
      }
      const { activeConversationId } = useAssistantStore.getState();
      if (shouldClearComposerAfterSubmit({ submittedConversationId: conversationId, activeConversationId })) {
        setInput("");
        setSelectedFiles([]);
      }
    };
    const onError = (error: unknown) => {
      releaseOwnedLock(lock);
      setRpcError(rpcErrorMessage(error));
    };

    if (conversation) {
      submitTurn.mutate({ conversationId, turnId: lock.messageId, text, files }, { onSuccess, onError });
    } else {
      startConversation.mutate(
        {
          conversationId,
          turnId: lock.messageId,
          text,
          model,
          reasoningEffort: preferredConversationReasoningEffort(model, preferredReasoningEffort),
          files,
        },
        { onSuccess, onError },
      );
    }
  }

  function cancel() {
    if (!canStop) return;
    cancelTurn.mutate(
      { conversationId },
      {
        onSuccess: () => {
          clearSubmitLock(conversationId);
        },
        onError: (error) => {
          setRpcError(rpcErrorMessage(error));
        },
      },
    );
  }

  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = getPastedImageFiles(event);
    if (files.length === 0) return;

    event.preventDefault();
    setUploadError(null);
    setSelectedFiles((current) => [...current, ...files].slice(0, MAX_UPLOAD_FILES));
    warmAgent();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <StickToBottom className="relative min-h-0 flex-1 overflow-y-auto" resize="smooth" initial="instant">
        <StickToBottom.Content className={cn("flex flex-col gap-4 p-3", isPage && "max-md:pb-32")}>
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
        ref={composerRef}
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
            warmAgent();
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
              <ReasoningEffortSelect
                effort={reasoningEffort}
                efforts={getModelReasoningEfforts(model)}
                locked={locked}
                onSelect={selectReasoningEffort}
              />
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
            onChange={(e) => {
              setInput(e.target.value);
              warmAgent();
            }}
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
              {isWorking ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Opens the assistant with an unpersisted conversation draft. */
export function useNewConversation() {
  const { openConversation } = useAssistantNavigation();
  const { open } = useAssistantSurface();

  return useCallback(() => {
    open();
    openConversation(generateId());
  }, [open, openConversation]);
}

export function AssistantSidebar() {
  const catchUp = useCatchUpConversationLastReadAt();
  const activeConversationId = useAssistantStore((s) => s.activeConversationId);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const showConversationList = useAssistantStore((s) => s.showConversationList);
  const [draftConversationId] = useState(generateId);

  useEffect(() => {
    if (activeConversationId == null) setActiveConversation(draftConversationId);
  }, [activeConversationId, draftConversationId, setActiveConversation]);

  const { data: conversations } = useDbQuery((db) =>
    db.selectFrom("conversation").selectAll().orderBy("updatedAt", "desc"),
  );

  const selectedConversationId = activeConversationId ?? draftConversationId;
  const active = conversations.find((conversation) => conversation.id === selectedConversationId);
  const target: ConversationTarget = active
    ? { kind: "persisted", conversation: active }
    : { kind: "draft", conversationId: selectedConversationId };

  async function deleteConversation(conversation: { id: string }) {
    await orpc.assistant.deleteConversation.call({ conversationId: conversation.id });
    useAssistantStore.getState().clearSubmitLock(conversation.id);
    if (conversation.id === selectedConversationId) {
      const next = conversations.find((row) => row.id !== conversation.id);
      setActiveConversation(next?.id ?? generateId());
      if (!showConversationList && next) catchUp(next.id);
    }
  }

  if (showConversationList) {
    return (
      <ConversationList
        conversations={conversations}
        activeId={selectedConversationId}
        onDeleteConversation={deleteConversation}
      />
    );
  }

  return (
    <ConversationView
      key={selectedConversationId}
      target={target}
      conversations={conversations}
      onDeleteConversation={deleteConversation}
    />
  );
}
