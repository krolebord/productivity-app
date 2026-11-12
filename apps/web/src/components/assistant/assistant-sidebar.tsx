import { needsTranscriptBackfill } from "@productivity/core/agent/agent-warmer";
import {
  findBuiltinSkill,
  isBuiltinSkillId,
  skillStarterPrompt,
  skillStarters,
} from "@productivity/core/agent/builtin-skills";
import { type ConversationTurnFile, conversationTurnFilesFromData } from "@productivity/core/agent/conversation-files";
import { formatCost, formatFileSize, formatModelPricing, MODEL_MODALITY_LABELS } from "@productivity/core/agent/format";
import {
  ASSISTANT_MODELS,
  ASSISTANT_MODELS_BY_PRICE,
  type AssistantModelId,
  type AssistantModelInputModality,
  type AssistantReasoningEffort,
  displayedReasoningEffort,
  formatReasoningEffortLabel,
  getAssistantModel,
  getModelReasoningEfforts,
  modelSupportsSelectableReasoning,
  preferredConversationReasoningEffort,
  resolveAssistantModelId,
} from "@productivity/core/agent/models";
import {
  assistantDownloadPath,
  downloadFileFromData,
  isMemoryToolName,
  linkHostname,
  type MemoryToolName,
  type MemoryToolPayload,
  memoryToolLabel,
  parseToolData,
  type ReadToolPayload,
  resourceFilename,
  type SkillToolPayload,
  type ToolLink,
  toolLabel,
  toolLinks,
  toolPayload,
  type WebToolPayload,
  webToolSummary,
} from "@productivity/core/agent/tool-messages";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, uploadTotalBytes } from "@productivity/core/agent/uploads";
import { conversationTitle } from "@productivity/core/conversation-list";
import {
  deleteConversation as deleteConversationRow,
  useConversationMessages,
  useConversations,
} from "@productivity/core/data/conversations";
import { markSkillUsed, useActiveSkills, useSkill } from "@productivity/core/data/skills";
import {
  isSubmitLockHolding,
  type SubmitLock,
  shouldClearComposerAfterSubmit,
  shouldClearSubmitLockOnError,
} from "@productivity/core/submit-lock";
import { useDb } from "@productivity/core/user-db/db-context";
import type { ConversationItem, ConversationMessageItem } from "@productivity/core/user-db/migrations";
import { generateId } from "@sqlite-sync/core";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
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
  Globe,
  ImageIcon,
  Loader2,
  type LucideIcon,
  Mic,
  Paperclip,
  PlusIcon,
  Search,
  Sparkles,
  Trash2,
  Type,
  Video,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { type ClipboardEvent, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Streamdown } from "streamdown";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { AssistantHeaderActions } from "@/components/assistant/assistant-header-actions";
import { ChatsBackButton, ConversationList } from "@/components/assistant/conversation-list";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth } from "@/lib/auth-client";
import { useAssistantNavigation } from "@/lib/use-assistant-navigation";
import { useAssistantSurface, useIsAssistantPage } from "@/lib/use-assistant-surface";
import { useBottomInset } from "@/lib/use-bottom-inset";
import { useCatchUpConversationLastReadAt } from "@/lib/use-catch-up-conversation-last-read";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { warmAssistantAgent } from "@/lib/warm-assistant-agent";
import { orpc } from "@/orpc/orpc-client";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "../ui/attachment";
import { Bubble, BubbleContent } from "../ui/bubble";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { useInlineConfirm } from "../ui/inline-confirm";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "../ui/input-group";
import { Message, MessageContent, MessageFooter } from "../ui/message";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "../ui/trace";

type ConversationRow = ConversationItem;
type ConversationIdentity = Pick<ConversationRow, "id" | "title">;

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

function rpcErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

function DownloadFileChip({ conversationId, file }: { conversationId: string; file: ConversationTurnFile }) {
  const href = assistantDownloadPath(conversationId, file.path);

  return (
    <Attachment size="sm">
      <AttachmentMedia>
        <FileText />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle className="max-w-48">{file.filename}</AttachmentTitle>
        <AttachmentDescription>{formatFileSize(file.size)}</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <Download className="mr-1 size-3.5 text-muted-foreground" />
      </AttachmentActions>
      <AttachmentTrigger render={<a href={href} download={file.filename} aria-label={`Download ${file.filename}`} />} />
    </Attachment>
  );
}

function ToolTraceLine({
  icon: Icon,
  title,
  description,
  failed,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  failed: boolean;
}) {
  return (
    <TraceLine status={failed ? "error" : undefined} className="text-xs">
      <TraceIcon>{failed ? <CircleAlert className="size-3.5" /> : <Icon className="size-3.5" />}</TraceIcon>
      <TraceTitle className="shrink-0">{title}</TraceTitle>
      {description && <TraceDescription className="min-w-0 shrink truncate">{description}</TraceDescription>}
    </TraceLine>
  );
}

function ToolCallChip({ name, failed }: { name: string; failed: boolean }) {
  return (
    <div title={name}>
      <ToolTraceLine icon={Wrench} title={toolLabel(name)} failed={failed} />
    </div>
  );
}

function NewChatSkills() {
  const db = useDb();
  const appendToInput = useAssistantStore((s) => s.appendToInput);
  const requestComposerFocus = useAssistantStore((s) => s.requestComposerFocus);
  const userSkills = useActiveSkills();

  const skills = skillStarters(userSkills);

  if (skills.length === 0) return null;

  function pick(skill: { id: string; name: string }) {
    if (!isBuiltinSkillId(skill.id)) {
      markSkillUsed(db.db, skill.id);
    }
    appendToInput(skillStarterPrompt(skill));
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
    <div>
      <ToolTraceLine icon={CircleAlert} title="Could not render chart" failed />
    </div>
  );
}

function logChartError(error: unknown) {
  console.error("Failed to render assistant chart", error);
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
        <span className="block truncate text-foreground">{title || linkHostname(url)}</span>
        <span className="block truncate text-muted-foreground/70">{linkHostname(url)}</span>
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
          <span className="truncate">{linkHostname(result.url)}</span>
        </span>
      ))}
      {results.length === 0 && failedResults.length === 0 && <p className="px-1 text-muted-foreground">No content.</p>}
    </div>
  );
}

function WebToolChip({ name, failed, data }: { name: string; failed: boolean; data: string }) {
  const payload = toolPayload<WebToolPayload>(data);
  const icon = name === "web_search" ? Search : Globe;
  const title = name === "web_search" ? "Searched the web" : "Read pages";
  const line = <ToolTraceLine icon={icon} title={title} description={webToolSummary(name, payload)} failed={failed} />;

  if (failed) return <div>{line}</div>;

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="text-xs">
        <WebToolDetails name={name} payload={payload} />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function MemoryChip({ name, failed, data }: { name: MemoryToolName; failed: boolean; data: string }) {
  const payload = toolPayload<MemoryToolPayload>(data);

  return (
    <Link to="/memories">
      <ToolTraceLine
        icon={Brain}
        title={memoryToolLabel(name)}
        description={name !== "forget" ? payload.content : undefined}
        failed={failed}
      />
    </Link>
  );
}

function ReadFileChip({ failed, data }: { failed: boolean; data: string }) {
  const { path } = toolPayload<ReadToolPayload>(data);

  return (
    <div>
      <ToolTraceLine
        icon={FileText}
        title={failed ? "Read failed" : "Read file"}
        description={path ? resourceFilename(path) : undefined}
        failed={failed}
      />
    </div>
  );
}

function ActivateSkillChip({ failed, data }: { failed: boolean; data: string }) {
  const { name: skillId } = toolPayload<SkillToolPayload>(data);
  const builtin = skillId ? findBuiltinSkill(skillId) : undefined;
  const skill = useSkill(builtin ? "" : (skillId ?? ""));
  const name = builtin ? builtin.name : skill ? skill.name || "Untitled skill" : skillId;

  return (
    <div>
      <ToolTraceLine
        icon={Workflow}
        title={failed ? "Skill activation failed" : "Activated skill"}
        description={name}
        failed={failed}
      />
    </div>
  );
}

function SkillChip({ failed, data }: { failed: boolean; data: string }) {
  const { id, name } = toolPayload<SkillToolPayload>(data);

  if (failed || !id) {
    return (
      <div>
        <ToolTraceLine icon={Workflow} title="Drafted skill" description={name} failed={failed} />
      </div>
    );
  }

  return (
    <Link to="/skills" search={{ selected: id }}>
      <ToolTraceLine icon={Workflow} title="Drafted skill — review" description={name} failed={false} />
    </Link>
  );
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

function ToolRow({ message, conversationId }: { message: ConversationMessageItem; conversationId: string }) {
  const { toolName, data } = message;
  const failed = message.toolState === "error";
  if (toolName === "saveDownload" && !failed) {
    const file = downloadFileFromData(data);
    if (file) return <DownloadFileChip conversationId={conversationId} file={file} />;
  }
  if (toolName === "web_search" || toolName === "web_extract") {
    return <WebToolChip name={toolName} failed={failed} data={data} />;
  }
  if (isMemoryToolName(toolName)) {
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
    const spec = parseToolData(data);
    return (
      <ErrorBoundary fallback={<ChartErrorChip />} onError={logChartError} resetKeys={[data]}>
        <Suspense fallback={<ToolCallChip name={toolName} failed={false} />}>
          <ChartCard spec={spec} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  if (toolName === "renderTransactions" && !failed) {
    const spec = parseToolData(data);
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
  return <ToolCallChip name={toolName} failed={failed} />;
}

type AssistantChunk =
  | { kind: "text"; message: ConversationMessageItem }
  | { kind: "tools"; messages: ConversationMessageItem[] };

function chunkAssistantRows(messages: ConversationMessageItem[]): AssistantChunk[] {
  const chunks: AssistantChunk[] = [];
  for (const message of messages) {
    if (message.kind !== "tool") {
      if (message.text) chunks.push({ kind: "text", message });
      continue;
    }
    const open = chunks.at(-1);
    if (open?.kind === "tools") open.messages.push(message);
    else chunks.push({ kind: "tools", messages: [message] });
  }
  return chunks;
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Copy reply"
            onClick={copy}
          />
        }
      >
        {copied ? <Check /> : <Copy />}
      </TooltipTrigger>
      <TooltipContent side="bottom">{copied ? "Copied" : "Copy"}</TooltipContent>
    </Tooltip>
  );
}

function UserTurn({ message }: { message: ConversationMessageItem }) {
  const files = conversationTurnFilesFromData(message.data);
  if (!message.text && files.length === 0) return null;

  return (
    <Message align="end">
      <MessageContent>
        {message.text ? (
          <Bubble align="end">
            <BubbleContent className="whitespace-pre-wrap selection:bg-primary-foreground/30 selection:text-primary">
              {message.text}
            </BubbleContent>
          </Bubble>
        ) : null}
        {files.length > 0 && (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
            {files.map((file) => (
              <Attachment key={file.path} size="xs">
                <AttachmentMedia>
                  <FileText />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle className="max-w-40">{file.filename}</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            ))}
          </div>
        )}
      </MessageContent>
    </Message>
  );
}

function AssistantTurn({
  messages,
  conversationId,
  streaming,
  latest,
}: {
  messages: ConversationMessageItem[];
  conversationId: string;
  streaming: boolean;
  latest: boolean;
}) {
  const chunks = chunkAssistantRows(messages);
  const text = chunks.flatMap((chunk) => (chunk.kind === "text" ? [chunk.message.text] : [])).join("\n\n");

  return (
    <Message>
      <MessageContent className="gap-3">
        {chunks.map((chunk) =>
          chunk.kind === "text" ? (
            <Streamdown key={chunk.message.id}>{chunk.message.text}</Streamdown>
          ) : (
            <Trace key={chunk.messages[0].id}>
              {chunk.messages.map((message) => (
                <ToolRow key={message.id} message={message} conversationId={conversationId} />
              ))}
            </Trace>
          ),
        )}
        {text && !streaming && (
          <MessageFooter
            className={cn(
              "-mt-2 px-0 transition-opacity",
              !latest &&
                "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/message:opacity-100 [@media(hover:hover)]:focus-within:opacity-100",
            )}
          >
            <CopyMessageButton text={text} />
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

function ComposerAttachment({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <Attachment size="sm" className="min-w-0 max-w-56">
      <AttachmentMedia variant={previewUrl ? "image" : "icon"}>
        {previewUrl ? <img src={previewUrl} alt="" /> : <FileText />}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{file.name}</AttachmentTitle>
        <AttachmentDescription>{formatFileSize(file.size)}</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction aria-label={`Remove ${file.name}`} onClick={onRemove}>
          <X />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
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

const MODEL_MODALITY_ICONS = {
  audio: Mic,
  file: FileText,
  image: ImageIcon,
  text: Type,
  video: Video,
} satisfies Record<AssistantModelInputModality, typeof Type>;

function ModelModalityIcons({ modalities }: { modalities: AssistantModelInputModality[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
      {modalities.map((modality) => {
        const label = MODEL_MODALITY_LABELS[modality];
        const Icon = MODEL_MODALITY_ICONS[modality];
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
          <span className="contents max-sm:hidden">
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
          <span className="contents max-sm:hidden">
            <ModelModalityIcons modalities={active.inputModalities} />
          </span>
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
  onDeleteConversation: (conversation: { id: string }) => void;
}) {
  const auth = useAuth();
  const { openNewConversation } = useAssistantNavigation();
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
                onClick={openNewConversation}
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
              <Trash2 className="size-4" />
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
  const [dragging, setDragging] = useState(false);
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

  const messages = useConversationMessages(conversationId);
  const groups = groupMessageRows(messages);

  // Opening the sidebar does not wake the agent. Ping it so onStart can copy a
  // pre-sqlite transcript into conversation_message. Skip brand-new empty chats.
  useEffect(() => {
    if (!conversation) return;
    if (ensuredRef.current || !needsTranscriptBackfill(conversation, messages.length)) return;
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
  const reasoningEffort = displayedReasoningEffort(model, conversation?.reasoningEffort, preferredReasoningEffort);

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
  function warmAgent() {
    if (!isWorking) warmAssistantAgent(conversationId);
  }

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

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    setUploadError(null);
    setSelectedFiles((current) => [...current, ...files].slice(0, MAX_UPLOAD_FILES));
    warmAgent();
  }

  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = getPastedImageFiles(event);
    if (files.length === 0) return;

    event.preventDefault();
    addFiles(files);
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
          {groups.map((group, index) =>
            group.role === "user" ? (
              <UserTurn key={group.messages[0].id} message={group.messages[0]} />
            ) : (
              <AssistantTurn
                key={group.messages[0].id}
                messages={group.messages}
                conversationId={conversationId}
                latest={index === groups.length - 1}
                streaming={isWorking && index === groups.length - 1}
              />
            ),
          )}
          {isWorking && (
            <TraceLine status="running">
              <TraceIcon>
                <Spinner className="size-3.5" />
              </TraceIcon>
              <TraceTitle>Thinking…</TraceTitle>
            </TraceLine>
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
        className="shrink-0 p-3 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <InputGroup
          className={cn(
            "rounded-xl bg-background dark:bg-input/30",
            dragging && "border-primary border-dashed ring-3 ring-primary/20",
          )}
        >
          {selectedFiles.length > 0 && (
            <InputGroupAddon align="block-start" className="cursor-default px-2 pt-2">
              <AttachmentGroup className="w-full gap-2">
                {selectedFiles.map((file, index) => (
                  <ComposerAttachment
                    key={`${file.name}-${file.lastModified}-${index}`}
                    file={file}
                    onRemove={() => setSelectedFiles((files) => files.filter((_, i) => i !== index))}
                  />
                ))}
              </AttachmentGroup>
            </InputGroupAddon>
          )}
          <InputGroupTextarea
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
            placeholder={dragging ? "Drop files to attach" : "Send a message…"}
            rows={2}
            className="max-h-40 min-h-14 px-3"
          />
          <InputGroupAddon align="block-end" className="cursor-default gap-1 px-2 pb-2">
            <InputGroupButton
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label="Attach files"
              disabled={isWorking || selectedFiles.length >= MAX_UPLOAD_FILES}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </InputGroupButton>
            <div className="flex min-w-0 flex-1 items-center gap-0.5 font-normal">
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
            {canStop ? (
              <InputGroupButton
                size="icon-sm"
                variant="secondary"
                className="shrink-0 rounded-full"
                aria-label="Stop generating"
                onClick={() => cancel()}
              >
                <CircleStop className="size-4" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                className="shrink-0 rounded-full"
                aria-label="Send message"
                disabled={isWorking || (!input.trim() && selectedFiles.length === 0)}
              >
                {isWorking ? <Spinner /> : <ArrowUp className="size-4" />}
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

/** Opens the assistant with an unpersisted conversation draft. */
export function useNewConversation() {
  const { openNewConversation } = useAssistantNavigation();
  const { open } = useAssistantSurface();

  return useCallback(() => {
    open();
    openNewConversation();
  }, [open, openNewConversation]);
}

export function AssistantSidebar() {
  const db = useDb();
  const catchUp = useCatchUpConversationLastReadAt();
  const activeConversationId = useAssistantStore((s) => s.activeConversationId);
  const setActiveConversation = useAssistantStore((s) => s.setActiveConversation);
  const showConversationList = useAssistantStore((s) => s.showConversationList);
  const [draftConversationId] = useState(generateId);

  useEffect(() => {
    if (activeConversationId == null) setActiveConversation(draftConversationId);
  }, [activeConversationId, draftConversationId, setActiveConversation]);

  const conversations = useConversations();

  const selectedConversationId = activeConversationId ?? draftConversationId;
  const active = conversations.find((conversation) => conversation.id === selectedConversationId);
  const target: ConversationTarget = active
    ? { kind: "persisted", conversation: active }
    : { kind: "draft", conversationId: selectedConversationId };

  function deleteConversation(conversation: { id: string }) {
    deleteConversationRow(db.db, conversation.id);
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
