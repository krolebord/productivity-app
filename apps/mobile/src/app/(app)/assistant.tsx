import { safe } from "@orpc/client";
import { createAgentWarmer, needsTranscriptBackfill } from "@productivity/core/agent/agent-warmer";
import { skillStarterPrompt } from "@productivity/core/agent/builtin-skills";
import { conversationTurnFilesFromData } from "@productivity/core/agent/conversation-files";
import { formatCost } from "@productivity/core/agent/format";
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
  setConversationPinned,
  useConversationMessageExists,
  useConversations,
  useConversationTail,
} from "@productivity/core/data/conversations";
import { isSubmitLockHolding, type SubmitLock } from "@productivity/core/submit-lock";
import { useDb } from "@productivity/core/user-db/db-context";
import type { ConversationItem, ConversationMessageItem } from "@productivity/core/user-db/migrations";
import { generateId } from "@sqlite-sync/core";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type FlatListInstance,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  type TextInputInstance,
  View,
} from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AttachmentChips,
  ContextUsageRing,
  ModelPicker,
  ReasoningEffortPicker,
} from "../../components/assistant/composer-controls";
import {
  ActivityBadge,
  ConversationList,
  confirmDeleteConversation,
  useDeleteConversation,
} from "../../components/assistant/conversation-list";
import { SkillStarters } from "../../components/assistant/skill-starters";
import { ToolMessage } from "../../components/assistant/tool-message";
import { Markdown } from "../../components/markdown";
import { ScreenHeader } from "../../components/screen-header";
import { ActionSheet } from "../../components/ui/action-sheet";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api";
import {
  appendToAssistantDraft,
  clearAssistantSubmitLock,
  getAssistantChat,
  markAssistantChatLeft,
  setAssistantDraft,
  setAssistantFiles,
  setAssistantSubmitLock,
  takeComposerFocusRequest,
  useAssistantChat,
  useComposerFocusNonce,
} from "../../lib/assistant-chats";
import { type PickedFile, pickDocuments, pickImages, toUploadFile } from "../../lib/assistant-uploads";
import { setPreference, usePreference } from "../../lib/preferences";
import { useConnectionBanner } from "../../lib/use-connection-banner";

// Within this distance of the end, new content keeps the transcript pinned to the bottom.
const STICK_TO_BOTTOM_THRESHOLD = 80;
// Messages read from the transcript's end at first, and how many more each scroll back to the top adds.
const MESSAGE_PAGE_SIZE = 40;

const warmAgent = createAgentWarmer((conversationId) => api.assistant.ensureProjection({ conversationId }));

function rpcErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

// Switching between the chat and the Chats list swaps the view in place: they're two views of
// one page, so neither may look like a push that back would undo.
const viewEnter = FadeIn.duration(150).reduceMotion(ReduceMotion.System);

/**
 * The assistant: one page in the app's stack that shows either a chat or the Chats list, so
 * back (‹, swipe or Android's) always leaves it. Whatever opens it picks the chat first by
 * setting the `assistantConversationId` preference (see components/assistant-button.tsx).
 */
export default function AssistantScreen() {
  const remembered = usePreference("assistantConversationId");
  const [view, setView] = useState<"chat" | "list">("chat");
  const focusNonce = useComposerFocusNonce();

  // Deleting the open chat leaves none; start a new one rather than reusing a deleted id.
  useEffect(() => {
    if (!remembered) setPreference("assistantConversationId", generateId());
  }, [remembered]);

  // Attaching context from elsewhere ("Ask assistant") brings the chat back into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the nonce is the trigger.
  useEffect(() => setView("chat"), [focusNonce]);

  const open = (id: string) => {
    setPreference("assistantConversationId", id);
    setView("chat");
  };

  if (!remembered) return <View className="flex-1 bg-background" />;

  return (
    <Animated.View key={view} entering={viewEnter} className="flex-1 bg-background">
      {view === "chat" ? (
        <ChatView conversationId={remembered} onShowChats={() => setView("list")} />
      ) : (
        <ChatsView activeId={remembered} onOpen={open} />
      )}
    </Animated.View>
  );
}

function ChatsView({ activeId, onOpen }: { activeId: string; onOpen: (id: string) => void }) {
  const router = useRouter();
  const conversations = useConversations();
  const deleteConversation = useDeleteConversation();
  return (
    <View className="flex-1">
      <ScreenHeader
        title="Chats"
        onBack={router.back}
        actions={
          <IconButton
            icon="edit"
            label="New chat"
            onPress={() => onOpen(generateId())}
            iconClassName="accent-muted-foreground"
          />
        }
      />
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onOpen={onOpen}
        onNew={() => onOpen(generateId())}
        onDelete={deleteConversation}
      />
    </View>
  );
}

function ChatView({ conversationId, onShowChats }: { conversationId: string; onShowChats: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const conversations = useConversations();
  const deleteConversation = useDeleteConversation();
  const pinDb = useDb();
  const [menuOpen, setMenuOpen] = useState(false);
  const conversation = conversations.find((row) => row.id === conversationId) ?? null;
  const activity = summarizeConversationActivity({ conversations, activeConversationId: conversationId });

  // For the reopen window: when this chat was last on screen.
  useEffect(() => () => markAssistantChatLeft(conversationId), [conversationId]);

  const usage =
    conversation && (conversation.totalCost || conversation.totalTokens)
      ? `${formatCost(conversation.totalCost)} · ${conversation.totalTokens.toLocaleString()} tokens`
      : undefined;

  return (
    // At the root: KeyboardAvoidingView measures its frame relative to its parent, so nesting
    // it under the header would under-count the keyboard overlap. Padding on Android too: the app
    // is edge-to-edge, so adjustResize no longer shrinks the window and the keyboard covers the composer.
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <View
        className="flex-row items-center gap-1 border-border border-b px-2 pb-2"
        style={{ paddingTop: insets.top + 4 }}
      >
        <IconButton icon="chevron-left" label="Close assistant" onPress={() => router.back()} size={26} />
        <Text numberOfLines={1} className="min-w-0 flex-1 px-1 font-semibold text-base text-foreground">
          {conversationTitle(conversation ?? { title: "" })}
        </Text>
        <View>
          <IconButton icon="list" label="Chats" onPress={onShowChats} iconClassName="accent-muted-foreground" />
          <ActivityBadge activity={activity} />
        </View>
        <IconButton
          icon="edit"
          label="New chat"
          onPress={() => setPreference("assistantConversationId", generateId())}
          iconClassName="accent-muted-foreground"
        />
        {conversation && (
          <IconButton
            icon="more-vertical"
            label="More actions"
            onPress={() => setMenuOpen(true)}
            iconClassName="accent-muted-foreground"
          />
        )}
      </View>
      <Chat key={conversationId} conversationId={conversationId} conversation={conversation} visible={focused} />
      <ActionSheet
        visible={menuOpen}
        title={usage}
        onClose={() => setMenuOpen(false)}
        items={[
          {
            label: conversation?.pinned ? "Unpin conversation" : "Pin conversation",
            icon: "bookmark",
            onPress: () => {
              if (conversation) setConversationPinned(pinDb.db, conversation.id, !conversation.pinned);
            },
          },
          {
            label: "Delete conversation",
            icon: "trash-2",
            destructive: true,
            onPress: () => {
              if (!conversation) return;
              confirmDeleteConversation(conversation, () => {
                deleteConversation(conversation.id);
                onShowChats();
              });
            },
          },
        ]}
      />
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
  // Debounced like the banner, so a quick reconnect doesn't flicker Send.
  const { offline } = useConnectionBanner();
  // Newest first: the transcript is an inverted list, whose first item sits at the bottom.
  const { messages, loadOlder } = useConversationTail(conversationId, MESSAGE_PAGE_SIZE);
  const { draft: input, files, lock: submitLock } = useAssistantChat(conversationId);
  const preferredModel = usePreference("assistantModel");
  const preferredReasoningEffort = usePreference("assistantReasoningEffort");
  const focusNonce = useComposerFocusNonce();
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<FlatListInstance>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const backfillRef = useRef(false);

  const lockMessageSynced = useConversationMessageExists(submitLock?.messageId);

  const model = conversation ? resolveAssistantModelId(conversation.model) : preferredModel;
  const reasoningEffort = displayedReasoningEffort(model, conversation?.reasoningEffort, preferredReasoningEffort);
  const isRunning = conversation?.turnStatus === "running";
  const isLockHolding = (lock: SubmitLock | undefined) =>
    isSubmitLockHolding({
      lock,
      conversation,
      hasMessage:
        lock != null &&
        // Asked of the table, not the loaded tail: after a long turn the sent message is no longer in it.
        ((lock.messageId === submitLock?.messageId && lockMessageSynced) ||
          messages.some((message) => message.id === lock.messageId)),
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

  // Viewing a chat marks its latest reply as read; not while another screen covers it.
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

  // Offset 0 is the bottom of an inverted list.
  const scrollToBottom = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });

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
    const { draft: sent, files: sentFiles } = getAssistantChat(conversationId);
    const text = sent.trim();
    // Read the store, not the render: a quick second tap lands before the lock re-renders.
    if (
      offline ||
      (!text && sentFiles.length === 0) ||
      isRunning ||
      isLockHolding(getAssistantChat(conversationId).lock)
    )
      return;

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
    // Cleared up front: comparing against the sent text after the request lost to keyboards
    // still committing a word, which left the composer full.
    setAssistantDraft(conversationId, "");
    setAssistantFiles(conversationId, []);
    inputRef.current?.clear();
    scrollToBottom();

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
      // Give the message back unless something new was typed in the meantime.
      setAssistantDraft(conversationId, (current) => current || sent);
      setAssistantFiles(conversationId, (current) => [...sentFiles, ...current]);
    }
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
        {messages.length === 0 && !isWorking ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName="grow justify-center gap-2 px-4 py-4"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <EmptyState
              icon="message-circle"
              title="Ask anything"
              description="About your notes, accounts, or plans."
            />
            <SkillStarters onPick={(skill) => appendToAssistantDraft(conversationId, skillStarterPrompt(skill))} />
          </ScrollView>
        ) : (
          // Inverted: the list starts at, and stays anchored to, its newest message, including
          // when the keyboard or the composer resizes it, and only mounts the rows near the
          // viewport. Scrolling up to its end reads older messages.
          <FlatList
            ref={listRef}
            inverted
            data={messages}
            keyExtractor={(message) => message.id}
            className="flex-1"
            // A transcript shorter than the screen starts at the top (the end of an inverted list).
            contentContainerClassName="grow justify-end px-4 pt-4 pb-1"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={100}
            onScroll={({ nativeEvent }) => setAtBottom(nativeEvent.contentOffset.y < STICK_TO_BOTTOM_THRESHOLD)}
            // Scrolled back, what's on screen stays put while replies arrive or grow below it;
            // near the bottom, the list follows the newest one. Anchored on the message before
            // the newest (index 1): the newest grows in place while it streams, which moves the
            // ones before it but not itself, so anchoring on it would let its own text slide.
            maintainVisibleContentPosition={{
              minIndexForVisible: 1,
              autoscrollToTopThreshold: STICK_TO_BOTTOM_THRESHOLD,
            }}
            onEndReachedThreshold={0.5}
            onEndReached={loadOlder}
            renderItem={({ item, index }) => (
              <MessageRow
                message={item}
                conversationId={conversationId}
                // Text grows in place while the turn runs; only the newest message can still be streaming.
                streaming={isRunning && index === 0}
              />
            )}
            // The header of an inverted list is below its newest message.
            ListHeaderComponent={
              isWorking ? (
                <View className="flex-row items-center gap-2 pb-3">
                  <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                  <Text className="text-muted-foreground text-sm">Thinking…</Text>
                </View>
              ) : undefined
            }
          />
        )}
        {!atBottom && messages.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scroll to bottom"
            onPress={scrollToBottom}
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
        <View className="flex-row items-center px-2">
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
          {conversation && !offline && <ContextUsageRing contextTokens={conversation.contextTokens} />}
          {offline && (
            <View className="ml-auto shrink-0 flex-row items-center gap-1 px-1.5">
              <Icon name="wifi-off" size={12} colorClassName="accent-muted-foreground" />
              <Text className="text-muted-foreground text-xs">Offline, can't send</Text>
            </View>
          )}
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
              disabled={offline || isWorking || (!input.trim() && files.length === 0)}
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
  const content = messageContent(message, conversationId, streaming);
  // The gap to the next message is the row's own: a message that shows nothing takes no space.
  return content && <View className="pb-3">{content}</View>;
}

function messageContent(message: ConversationMessageItem, conversationId: string, streaming: boolean) {
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
