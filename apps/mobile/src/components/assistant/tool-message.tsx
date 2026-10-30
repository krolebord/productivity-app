import { findBuiltinSkill } from "@productivity/core/agent/builtin-skills";
import type { ConversationTurnFile } from "@productivity/core/agent/conversation-files";
import { formatFileSize } from "@productivity/core/agent/format";
import {
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
  toolLinks,
  toolPayload,
  type WebToolPayload,
  webToolSummary,
} from "@productivity/core/agent/tool-messages";
import { useSkill } from "@productivity/core/data/skills";
import type { ConversationMessageItem } from "@productivity/core/user-db/migrations";
import { useRouter } from "expo-router";
import { Component, type ReactNode, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from "react-native";
import { shareAssistantDownload } from "../../lib/assistant-download";
import { Icon } from "../ui/icon";
import { ChartCard } from "./chart-card";
import { ToolChip, ToolErrorChip } from "./tool-chip";
import { TransactionsCard } from "./transactions-card";

/** A bad spec shouldn't take the whole transcript down with it. */
class CardBoundary extends Component<{ fallback: ReactNode; resetKey: string; children: ReactNode }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; resetKey: string },
  ): { failed: boolean; resetKey: string } | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown) {
    console.error("Failed to render assistant tool card", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SourceLink({ url, title }: ToolLink) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-start gap-1.5 rounded-sm px-1 py-1 active:bg-muted"
    >
      <Icon name="external-link" size={12} colorClassName="accent-muted-foreground" className="mt-0.5" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-foreground text-xs">
          {title || linkHostname(url)}
        </Text>
        <Text numberOfLines={1} className="text-muted-foreground/70 text-xs">
          {linkHostname(url)}
        </Text>
      </View>
    </Pressable>
  );
}

function WebToolChip({ name, failed, data }: { name: string; failed: boolean; data: string }) {
  const [open, setOpen] = useState(false);
  const payload = toolPayload<WebToolPayload>(data);
  const results = toolLinks(payload.results);
  const failedResults = name === "web_search" ? [] : toolLinks(payload.failedResults);

  return (
    <View className="max-w-full self-start overflow-hidden rounded-md border border-border bg-muted/50">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: failed }}
        disabled={failed}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-1.5 px-2 py-1 active:bg-muted"
      >
        <Icon
          name={failed ? "alert-circle" : name === "web_search" ? "search" : "file-text"}
          size={12}
          colorClassName={failed ? "accent-destructive" : "accent-muted-foreground"}
        />
        <Text className="font-mono text-muted-foreground text-xs">{name}</Text>
        {webToolSummary(name, payload) ? (
          <Text numberOfLines={1} className="min-w-0 shrink text-muted-foreground/80 text-xs">
            {webToolSummary(name, payload)}
          </Text>
        ) : null}
        {!failed && (
          <Icon name={open ? "chevron-up" : "chevron-down"} size={12} colorClassName="accent-muted-foreground" />
        )}
      </Pressable>
      {open && !failed && (
        <View className="gap-0.5 border-border border-t px-2 py-1.5">
          {name === "web_search" && payload.answer ? (
            <Text numberOfLines={6} className="px-1 pb-1 text-muted-foreground text-xs">
              {payload.answer}
            </Text>
          ) : null}
          {results.map((result) => (
            <SourceLink key={result.url} url={result.url} title={result.title} />
          ))}
          {failedResults.map((result) => (
            <View key={result.url} className="flex-row items-center gap-1.5 px-1">
              <Icon name="alert-circle" size={12} colorClassName="accent-destructive" />
              <Text numberOfLines={1} className="text-destructive text-xs">
                {linkHostname(result.url)}
              </Text>
            </View>
          ))}
          {results.length === 0 && failedResults.length === 0 && !payload.answer && (
            <Text className="px-1 text-muted-foreground text-xs">
              {name === "web_search" ? "No results." : "No content."}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function MemoryChip({ name, failed, data }: { name: MemoryToolName; failed: boolean; data: string }) {
  const router = useRouter();
  const { content } = toolPayload<MemoryToolPayload>(data);
  return (
    <ToolChip
      icon="bookmark"
      failed={failed}
      label={memoryToolLabel(name)}
      detail={name !== "forget" ? content : undefined}
      onPress={() => router.push("/memories")}
    />
  );
}

function ActivateSkillChip({ failed, data }: { failed: boolean; data: string }) {
  const { name: skillId } = toolPayload<SkillToolPayload>(data);
  const builtin = skillId ? findBuiltinSkill(skillId) : undefined;
  const skill = useSkill(builtin ? "" : (skillId ?? ""));
  const name = builtin ? builtin.name : skill ? skill.name || "Untitled skill" : skillId;
  return (
    <ToolChip
      icon="layers"
      failed={failed}
      label={failed ? "Skill activation failed" : "Activated skill"}
      detail={name}
    />
  );
}

function SkillChip({ failed, data }: { failed: boolean; data: string }) {
  const router = useRouter();
  const { id, name } = toolPayload<SkillToolPayload>(data);
  const reviewable = !failed && !!id;
  return (
    <ToolChip
      icon="layers"
      failed={failed}
      label="Drafted skill"
      detail={name}
      accessibilityLabel={reviewable ? `Review drafted skill ${name ?? ""}` : undefined}
      onPress={reviewable ? () => router.push({ pathname: "/skills", params: { selected: id } }) : undefined}
    >
      {reviewable && (
        <View className="rounded-sm border border-border px-1.5 py-0.5">
          <Text className="font-medium text-foreground text-xs">Review</Text>
        </View>
      )}
    </ToolChip>
  );
}

function DownloadChip({ conversationId, file }: { conversationId: string; file: ConversationTurnFile }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await shareAssistantDownload(conversationId, file);
    } catch (error) {
      Alert.alert("Couldn't download the file", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ToolChip
      icon="download"
      label={file.filename}
      detail={formatFileSize(file.size)}
      accessibilityLabel={`Download ${file.filename}`}
      onPress={busy ? undefined : () => void download()}
    >
      {busy && <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />}
    </ToolChip>
  );
}

/** A tool call in the transcript, rendered like the web: cards for charts and transactions, chips otherwise. */
export function ToolMessage({ message, conversationId }: { message: ConversationMessageItem; conversationId: string }) {
  const { toolName, data } = message;
  const failed = message.toolState === "error";

  if (toolName === "saveDownload" && !failed) {
    const file = downloadFileFromData(data);
    if (file) return <DownloadChip conversationId={conversationId} file={file} />;
  }
  if (toolName === "web_search" || toolName === "web_extract") {
    return <WebToolChip name={toolName} failed={failed} data={data} />;
  }
  if (isMemoryToolName(toolName)) {
    return <MemoryChip name={toolName} failed={failed} data={data} />;
  }
  if (toolName === "read" || toolName === "read_skill_resource") {
    const { path } = toolPayload<ReadToolPayload>(data);
    return (
      <ToolChip
        icon="file-text"
        failed={failed}
        label={failed ? "Read failed" : "Read file"}
        detail={path ? resourceFilename(path) : undefined}
      />
    );
  }
  if (toolName === "activate_skill") {
    return <ActivateSkillChip failed={failed} data={data} />;
  }
  if (toolName === "create_skill") {
    return <SkillChip failed={failed} data={data} />;
  }
  if (toolName === "renderChart" && !failed) {
    return (
      <CardBoundary fallback={<ToolErrorChip label="Could not render chart" />} resetKey={data}>
        <ChartCard spec={parseToolData(data)} />
      </CardBoundary>
    );
  }
  if (toolName === "renderTransactions" && !failed) {
    return (
      <CardBoundary fallback={<ToolChip icon="check" label={toolName} mono />} resetKey={data}>
        <TransactionsCard spec={parseToolData(data)} />
      </CardBoundary>
    );
  }
  return <ToolChip icon="check" failed={failed} label={toolName || "tool"} mono />;
}
