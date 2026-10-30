import { formatCost, formatFileSize, formatModelPricing, MODEL_MODALITY_LABELS } from "@productivity/core/agent/format";
import {
  ASSISTANT_MODELS,
  ASSISTANT_MODELS_BY_PRICE,
  type AssistantModelId,
  type AssistantModelInputModality,
  type AssistantReasoningEffort,
  formatReasoningEffortLabel,
  getAssistantModel,
} from "@productivity/core/agent/models";
import type { ConversationItem } from "@productivity/core/user-db/migrations";
import { type ReactNode, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import type { PickedFile } from "../../lib/assistant-uploads";
import { Icon, type IconName, MaterialIcon } from "../ui/icon";
import { SelectSheet } from "../ui/select-sheet";

const MODEL_MODALITY_ICONS = {
  audio: "mic",
  file: "file-text",
  image: "image",
  text: "type",
  video: "video",
} satisfies Record<AssistantModelInputModality, IconName>;

/** The input modalities as icons, as on web, so the model list stays compact. */
function ModelModalityIcons({ modalities }: { modalities: readonly AssistantModelInputModality[] }) {
  return (
    <View
      accessible
      accessibilityLabel={modalities.map((modality) => MODEL_MODALITY_LABELS[modality]).join(", ")}
      className="shrink-0 flex-row items-center gap-1"
    >
      {modalities.map((modality) => (
        <Icon key={modality} name={MODEL_MODALITY_ICONS[modality]} size={12} colorClassName="accent-muted-foreground" />
      ))}
    </View>
  );
}

/** Artificial Analysis intelligence index, when the model reports one. */
function ModelIntelligenceScore({ score }: { score: number | undefined }) {
  if (score == null) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Intelligence index ${score}`}
      className="shrink-0 flex-row items-center gap-0.5"
    >
      <MaterialIcon name="gauge" size={13} colorClassName="accent-muted-foreground" />
      <Text className="text-muted-foreground text-sm tabular-nums">{score}</Text>
    </View>
  );
}

const MODEL_OPTIONS = ASSISTANT_MODELS_BY_PRICE.map((model) => ({
  value: model.id,
  label: model.label,
  description: formatModelPricing(model),
  keywords: model.inputModalities.map((modality) => MODEL_MODALITY_LABELS[modality]).join(" "),
  labelAccessory: <ModelModalityIcons modalities={model.inputModalities} />,
  descriptionAccessory: <ModelIntelligenceScore score={model.intelligenceScore} />,
}));

/** A compact trigger in the row above the composer; static once the conversation has started. */
function PickerTrigger({
  icon,
  label,
  locked,
  lockedMessage,
  accessibilityLabel,
  accessory,
  onPress,
}: {
  icon: IconName;
  label: string;
  locked: boolean;
  lockedMessage: string;
  accessibilityLabel: string;
  accessory?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${label}`}
      accessibilityHint={locked ? lockedMessage : undefined}
      // Locked pickers still answer a tap, so it's clear why they don't open.
      onPress={locked ? () => Alert.alert(lockedMessage) : onPress}
      hitSlop={4}
      className="min-w-0 shrink flex-row items-center gap-1 rounded-md px-1.5 py-1 active:bg-muted"
    >
      <Icon name={icon} size={13} colorClassName="accent-muted-foreground" />
      <Text numberOfLines={1} className="shrink text-muted-foreground text-xs">
        {label}
      </Text>
      {accessory}
      {!locked && <Icon name="chevron-down" size={12} colorClassName="accent-muted-foreground" />}
    </Pressable>
  );
}

export function ModelPicker({
  model,
  locked,
  onSelect,
}: {
  model: AssistantModelId;
  locked: boolean;
  onSelect: (model: AssistantModelId) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = getAssistantModel(model) ?? ASSISTANT_MODELS[0];
  return (
    <>
      <PickerTrigger
        icon="cpu"
        label={active.label}
        locked={locked}
        lockedMessage="The model is fixed once the conversation starts."
        accessibilityLabel="Model"
        accessory={<ModelModalityIcons modalities={active.inputModalities} />}
        onPress={() => setOpen(true)}
      />
      <SelectSheet
        visible={open}
        title="Model"
        value={active.id}
        options={MODEL_OPTIONS}
        onClose={() => setOpen(false)}
        onSelect={(next) => {
          setOpen(false);
          onSelect(next as AssistantModelId);
        }}
      />
    </>
  );
}

export function ReasoningEffortPicker({
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerTrigger
        icon="activity"
        label={formatReasoningEffortLabel(effort)}
        locked={locked}
        lockedMessage="Reasoning effort is fixed once the conversation starts."
        accessibilityLabel="Reasoning effort"
        onPress={() => setOpen(true)}
      />
      <SelectSheet
        visible={open}
        title="Reasoning effort"
        value={effort}
        options={efforts.map((level) => ({ value: level, label: formatReasoningEffortLabel(level) }))}
        onClose={() => setOpen(false)}
        onSelect={(next) => {
          setOpen(false);
          onSelect(next as AssistantReasoningEffort);
        }}
      />
    </>
  );
}

/** Spend so far, with the token count the web shows in its tooltip. */
export function ConversationCost({ conversation }: { conversation: ConversationItem }) {
  if (!conversation.totalCost && !conversation.totalTokens) return null;
  return (
    <Text
      accessibilityLabel={`${conversation.totalTokens.toLocaleString()} tokens, ${formatCost(conversation.totalCost)} this conversation`}
      className="shrink-0 px-1.5 text-muted-foreground text-xs tabular-nums"
    >
      {formatCost(conversation.totalCost)}
      <Text className="text-muted-foreground/70"> · {conversation.totalTokens.toLocaleString()} tok</Text>
    </Text>
  );
}

export function AttachmentChips({
  files,
  onRemove,
}: {
  files: readonly PickedFile[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-3">
      {files.map((file, index) => (
        <View
          key={`${file.uri}-${index}`}
          className="max-w-56 flex-row items-center gap-1.5 rounded-md border border-border bg-muted/50 py-1 pr-1 pl-2"
        >
          <Icon
            name={file.mimeType.startsWith("image/") ? "image" : "file-text"}
            size={13}
            colorClassName="accent-muted-foreground"
          />
          <Text numberOfLines={1} className="shrink text-foreground text-xs">
            {file.name}
          </Text>
          <Text className="shrink-0 text-muted-foreground text-xs">{formatFileSize(file.size)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${file.name}`}
            hitSlop={6}
            onPress={() => onRemove(index)}
            className="size-5 items-center justify-center rounded-sm active:bg-muted"
          >
            <Icon name="x" size={12} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
