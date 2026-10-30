import { safe } from "@orpc/client";
import { createAgentWarmer, needsTranscriptBackfill } from "@productivity/core/agent/agent-warmer";
import { skillStarterPrompt } from "@productivity/core/agent/builtin-skills";
import { conversationTurnFilesFromData } from "@productivity/core/agent/conversation-files";
import {
  type AssistantModelId,
  type AssistantReasoningEffort,
  displayedReasoningEffort,
  getModelReasoningEfforts,
  modelSupportsSelectableReasoning,
  preferredConversationReasoningEffort,
  resolveAssistantModelId,
} from "@productivity/core/agent/models";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, uploadTotalBytes } from "@productivity/core/agent/uploads";
import { conversationTitle, summarizeConversationActivity } from "@productivity/core/conversation-list";
import {
  catchUpConversationLastRead,
  deleteConversation as deleteConversationRow,
  useConversationMessages,
  useConversations,
} from "@productivity/core/data/conversations";
import { isSubmitLockHolding, type SubmitLock } from "@productivity/core/submit-lock";
import { useDb } from "@productivity/core/user-db/db-context";
import type { ConversationItem, ConversationMessageItem } from "@productivity/core/user-db/migrations";
import { generateId } from "@sqlite-sync/core";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  Text,
  type TextInputInstance,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AttachmentChips,
  ConversationCost,
  ModelPicker,
  ReasoningEffortPicker,
} from "../../components/assistant/composer-controls";
import {
  ActivityBadge,
  ConversationList,
  confirmDeleteConversation,
} from "../../components/assistant/conversation-list";
import { SkillStarters } from "../../components/assistant/skill-starters";
import { ToolMessage } from "../../components/assistant/tool-message";
import { Markdown } from "../../components/markdown";
import { ActionSheet } from "../../components/ui/action-sheet";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api";
import {
  appendToAssistantDraft,
  clearAssistantChat,
  clearAssistantSubmitLock,
  getAssistantChat,
  setAssistantDraft,
  setAssistantFiles,
  setAssistantSubmitLock,
  takeComposerFocusRequest,
  useAssistantChat,
  useComposerFocusNonce,
} from "../../lib/assistant-chats";
import { type PickedFile, pickDocuments, pickImages, toUploadFile } from "../../lib/assistant-uploads";
import { setPreference, usePreference } from "../../lib/preferences";

// Within this distance of the end, new content keeps the transcript pinned to the bottom.
const STICK_TO_BOTTOM_THRESHOLD = 80;

const warmAgent = createAgentWarmer((conversationId) => api.assistant.ensureProjection({ conversationId }));

function rpcErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

export default function AssistantScreen() {
  const router = useRouter();
  const db = useDb();
  const insets = useSafeAreaInsets();
  const conversations = useConversations();
  const remembered = usePreference("assistantConversationId");
  // With nothing remembered yet, open on the newest chat.
  const [initialId] = useState(() => conversations[0]?.id ?? generateId());
  const conversationId = remembered ?? initialId;
  const [showList, setShowList] = useState(false);
  const conversation = conversations.find((row) => row.id === conversationId) ?? null;
  const activity = summarizeConversationActivity({ conversations, activeConversationId: conversationId });

  // Remembered across restarts, as the web persists its active chat; attaching context
  // from elsewhere in the app also lands in whichever chat this is.
  useEffect(() => {
    if (!remembered) setPreference("assistantConversationId", initialId);
  }, [remembered, initialId]);

  const openConversation = (id: string) => {
    setPreference("assistantConversationId", id);
    setShowList(false);
  };

  const deleteConversation = (id: string) => {
    deleteConversationRow(db.db, id);
    clearAssistantChat(id);
    if (id === conversationId) {
      const next = conversations.find((row) => row.id !== id);
      setPreference("assistantConversationId", next?.id ?? generateId());
    }
  };

  return (
    // At the root: KeyboardAvoidingView measures its frame relative to its parent, so nesting
    // it under the header would under-count the keyboard overlap.
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View
        className="flex-row items-center gap-1 border-border border-b px-2 pb-2"
        style={{ paddingTop: insets.top + 4 }}
      >
        <IconButton icon="chevron-left" label="Back" onPress={() => router.back()} size={26} />
        <Text numberOfLines={1} className="min-w-0 flex-1 px-1 font-semibold text-base text-foreground">
          {showList ? "Chats" : conversationTitle(conversation ?? { title: "" })}
        </Text>
        {!showList && conversation && (
          <IconButton
            icon="trash-2"
            label="Delete conversation"
            onPress={() => confirmDeleteConversation(conversation, () => deleteConversation(conversation.id))}
            iconClassName="accent-muted-foreground"
          />
        )}
        <View>
          <IconButton
            icon={showList ? "message-circle" : "list"}
            label={showList ? "Back to chat" : "Show chats"}
            onPress={() => setShowList((value) => !value)}
            iconClassName="accent-muted-foreground"
          />
          {!showList && <ActivityBadge activity={activity} />}
        </View>
        <IconButton
          icon="edit"
          label="New chat"
          onPress={() => openConversation(generateId())}
          iconClassName="accent-muted-foreground"
        />
      </View>
      {showList && (
        <ConversationList
          conversations={conversations}
          activeId={conversationId}
          onOpen={openConversation}
          onNew={() => openConversation(generateId())}
          onDelete={deleteConversation}
        />
      )}
      {/* Hidden rather than unmounted, so the draft and an in-flight send survive a look at the list. */}
      <View className={showList ? "hidden" : "flex-1"}>
        <Chat key={conversationId} conversationId={conversationId} conversation={conversation} visible={!showList} />
      </View>
    </KeyboardAvoidingView>
  );
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

function Chat({
  conversationId,
  conversation,
  visible,
}: {
  conversationId: string;
  conversation: ConversationItem | null;
  visible: boolean;
}) {
  const db = useDb();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const messages = useConversationMessages(conversationId);
  const { draft: input, files, lock: submitLock } = useAssistantChat(conversationId);
  const preferredModel = usePreference("assistantModel");
  const preferredReasoningEffort = usePreference("assistantReasoningEffort");
  const focusNonce = useComposerFocusNonce();
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const nearBottomRef = useRef(true);
  const backfillRef = useRef(false);

  const model = conversation ? resolveAssistantModelId(conversation.model) : preferredModel;
  const reasoningEffort = displayedReasoningEffort(model, conversation?.reasoningEffort, preferredReasoningEffort);
  const isRunning = conversation?.turnStatus === "running";
  const isLockHolding = (lock: SubmitLock | undefined) =>
    isSubmitLockHolding({
      lock,
      conversation,
      hasMessage: lock != null && messages.some((message) => message.id === lock.messageId),
    });
  const lockHolding = isLockHolding(submitLock);
  const isWorking = lockHolding || isRunning;
  const canStop = isRunning || (lockHolding && conversation !== null);
  const locked = conversation !== null || submitLock != null;
  const turnError = conversation?.turnStatus === "error" ? conversation.turnError : "";

  // Drop the lock once the turn has moved past it, so the next send starts clean.
  useEffect(() => {
    if (submitLock && !lockHolding) clearAssistantSubmitLock(conversationId, submitLock);
  }, [conversationId, submitLock, lockHolding]);

  // Viewing a chat marks its latest reply as read; not while the list covers it.
  const updatedAt = conversation?.updatedAt;
  useEffect(() => {
    if (visible && updatedAt != null) catchUpConversationLastRead(db.db, conversationId);
  }, [db, conversationId, updatedAt, visible]);

  // Older chats may predate the synced transcript; waking the agent backfills it. A failed
  // call is retried the next time this runs, as on the web.
  const needsBackfill = needsTranscriptBackfill(conversation, messages.length);
  useEffect(() => {
    if (!needsBackfill || backfillRef.current) return;
    backfillRef.current = true;
    void safe(api.assistant.ensureProjection({ conversationId })).then(({ error }) => {
      if (error) backfillRef.current = false;
    });
  }, [needsBackfill, conversationId]);

  // Attaching context or picking a skill asks for the composer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the nonce is the trigger.
  useEffect(() => {
    if (visible && takeComposerFocusRequest()) inputRef.current?.focus();
  }, [focusNonce, visible]);

  const warm = () => {
    if (!isWorking) warmAgent(conversationId);
  };

  const addFiles = (picked: PickedFile[]) => {
    if (picked.length === 0) return;
    setUploadError(null);
    setAssistantFiles(conversationId, (current) => [...current, ...picked].slice(0, MAX_UPLOAD_FILES));
    warm();
  };

  const pick = async (picker: () => Promise<PickedFile[]>) => {
    try {
      addFiles(await picker());
    } catch (error) {
      setUploadError(rpcErrorMessage(error));
    }
  };

  const submit = async () => {
    const sent = input;
    const sentFiles = files;
    const text = sent.trim();
    // Read the store, not the render: a quick second tap lands before the lock re-renders.
    if ((!text && sentFiles.length === 0) || isRunning || isLockHolding(getAssistantChat(conversationId).lock)) return;

    setRpcError(null);
    setUploadError(null);
    if (uploadTotalBytes(sentFiles) > MAX_UPLOAD_BYTES) {
      setUploadError("Combined upload is too large.");
      return;
    }
    const lock: SubmitLock = {
      kind: "sync",
      messageId: generateId(),
      submittedUpdatedAt: conversation?.updatedAt ?? null,
    };
    setAssistantSubmitLock(conversationId, lock);
    nearBottomRef.current = true;

    const uploads = sentFiles.map(toUploadFile);
    const { error, data } = await safe(
      conversation
        ? api.assistant.submitTurn({ conversationId, turnId: lock.messageId, text, files: uploads })
        : api.assistant.startConversation({
            conversationId,
            turnId: lock.messageId,
            text,
            model,
            reasoningEffort: preferredConversationReasoningEffort(model, preferredReasoningEffort),
            files: uploads,
          }),
    );
    if (error || !data.accepted) {
      clearAssistantSubmitLock(conversationId, lock);
      if (error) setRpcError(rpcErrorMessage(error));
      return;
    }
    // Keep anything typed or attached while the send was in flight.
    setAssistantDraft(conversationId, (current) => (current === sent ? "" : current));
    // By identity, so a file removed or added mid-send isn't resent or dropped.
    setAssistantFiles(conversationId, (current) => current.filter((file) => !sentFiles.includes(file)));
  };

  const cancel = async () => {
    const { error } = await safe(api.assistant.cancelTurn({ conversationId }));
    if (error) setRpcError(rpcErrorMessage(error));
    else clearAssistantSubmitLock(conversationId);
  };

  const errorMessage = uploadError ?? rpcError ?? turnError;

  return (
    <View className="flex-1">
      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="grow gap-3 px-4 py-4"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={100}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
            const near = contentSize.height - contentOffset.y - layoutMeasurement.height < STICK_TO_BOTTOM_THRESHOLD;
            nearBottomRef.current = near;
            setAtBottom(near);
          }}
          onContentSizeChange={() => {
            if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true });
          }}
          // The viewport shrinks when the keyboard opens or the composer grows.
          onLayout={() => {
            if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          {messages.length === 0 && !isWorking ? (
            <View className="flex-1 justify-center gap-2">
              <EmptyState
                icon="message-circle"
                title="Ask anything"
                description="About your notes, accounts, or plans."
              />
              <SkillStarters onPick={(skill) => appendToAssistantDraft(conversationId, skillStarterPrompt(skill))} />
            </View>
          ) : (
            messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                conversationId={conversationId}
                // Text grows in place while the turn runs; only the newest message can still be streaming.
                streaming={isRunning && index === messages.length - 1}
              />
            ))
          )}
          {isWorking && (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              <Text className="text-muted-foreground text-sm">Thinking…</Text>
            </View>
          )}
        </ScrollView>
        {!atBottom && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scroll to bottom"
            onPress={() => {
              nearBottomRef.current = true;
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
            className="absolute bottom-3 size-9 items-center justify-center self-center rounded-full border border-border bg-card shadow-md active:bg-muted"
          >
            <Icon name="arrow-down" size={18} colorClassName="accent-foreground" />
          </Pressable>
        )}
      </View>

      {!!errorMessage && (
        <View className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-destructive text-xs">{errorMessage}</Text>
        </View>
      )}

      <View
        className="gap-1.5 border-border border-t pt-2"
        style={{ paddingBottom: keyboardVisible ? 8 : insets.bottom + 8 }}
      >
        <AttachmentChips
          files={files}
          onRemove={(index) => setAssistantFiles(conversationId, (current) => current.filter((_, i) => i !== index))}
        />
        <View className="flex-row items-center justify-between gap-2 px-2">
          <View className="min-w-0 shrink flex-row items-center gap-1">
            <ModelPicker
              model={model}
              locked={locked}
              onSelect={(next: AssistantModelId) => setPreference("assistantModel", next)}
            />
            {modelSupportsSelectableReasoning(model) && (
              <ReasoningEffortPicker
                effort={reasoningEffort}
                efforts={getModelReasoningEfforts(model)}
                locked={locked}
                onSelect={(next: AssistantReasoningEffort) => setPreference("assistantReasoningEffort", next)}
              />
            )}
          </View>
          {conversation && <ConversationCost conversation={conversation} />}
        </View>
        <View className="flex-row items-end gap-1 px-2">
          <IconButton
            icon="paperclip"
            label="Attach files"
            onPress={() => setAttachOpen(true)}
            disabled={isWorking || files.length >= MAX_UPLOAD_FILES}
            iconClassName="accent-muted-foreground"
          />
          <Input
            ref={inputRef}
            value={input}
            onChangeText={(text) => {
              setAssistantDraft(conversationId, text);
              warm();
            }}
            placeholder="Message"
            multiline
            className="max-h-32 min-h-10 flex-1 rounded-2xl bg-muted px-4 pt-2.5 pb-2.5"
          />
          {canStop ? (
            <IconButton
              icon="square"
              label="Stop generating"
              onPress={() => void cancel()}
              className="bg-muted"
              size={16}
            />
          ) : (
            <IconButton
              icon="arrow-up"
              label="Send message"
              onPress={() => void submit()}
              disabled={isWorking || (!input.trim() && files.length === 0)}
              className="bg-primary"
              iconClassName="accent-primary-foreground"
            />
          )}
        </View>
      </View>
      <ActionSheet
        visible={attachOpen}
        title="Attach"
        onClose={() => setAttachOpen(false)}
        items={[
          {
            label: "Photo library",
            icon: "image",
            onPress: () => void pick(() => pickImages(MAX_UPLOAD_FILES - files.length)),
          },
          { label: "Files", icon: "file", onPress: () => void pick(pickDocuments) },
        ]}
      />
    </View>
  );
}

function MessageRow({
  message,
  conversationId,
  streaming,
}: {
  message: ConversationMessageItem;
  conversationId: string;
  streaming: boolean;
}) {
  if (message.kind === "tool") return <ToolMessage message={message} conversationId={conversationId} />;

  if (message.role === "user") {
    const files = conversationTurnFilesFromData(message.data);
    if (!message.text && files.length === 0) return null;
    return (
      <View className="ml-12 gap-2 self-end rounded-2xl bg-primary px-3.5 py-2">
        {message.text ? (
          <Text selectable className="text-base text-primary-foreground">
            {message.text}
          </Text>
        ) : null}
        {files.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5">
            {files.map((file) => (
              <View
                key={file.path}
                className="max-w-full flex-row items-center gap-1.5 rounded-md border border-primary-foreground/25 bg-primary-foreground/10 px-2 py-1"
              >
                <Icon name="file-text" size={13} colorClassName="accent-primary-foreground" />
                <Text numberOfLines={1} className="max-w-40 text-primary-foreground text-xs">
                  {file.filename}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (!message.text) return null;

  return <Markdown markdown={message.text} streaming={streaming} />;
}
