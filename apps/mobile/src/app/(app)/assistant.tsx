import { safe } from "@orpc/client";
import { DEFAULT_ASSISTANT_MODEL, getAssistantModel, resolveAssistantModelId } from "@productivity/core/agent/models";
import { conversationRowStatus, conversationTitle } from "@productivity/core/conversation-list";
import {
  catchUpConversationLastRead,
  useConversationMessages,
  useConversations,
} from "@productivity/core/data/conversations";
import { isSubmitLockHolding, type SubmitLock } from "@productivity/core/submit-lock";
import { useDb } from "@productivity/core/user-db/db-context";
import type { ConversationItem, ConversationMessageItem } from "@productivity/core/user-db/migrations";
import { generateId } from "@sqlite-sync/core";
import { format, isToday } from "date-fns";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api";

// Reopening the assistant resumes the chat it was last showing, until the app restarts.
let lastConversationId: string | null = null;

// Within this distance of the end, new content keeps the transcript pinned to the bottom.
const STICK_TO_BOTTOM_THRESHOLD = 80;

function rpcErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const conversations = useConversations();
  const [conversationId, setConversationId] = useState(
    () => lastConversationId ?? conversations[0]?.id ?? generateId(),
  );
  const [showList, setShowList] = useState(false);
  const conversation = conversations.find((row) => row.id === conversationId) ?? null;
  const model = getAssistantModel(conversation ? resolveAssistantModelId(conversation.model) : DEFAULT_ASSISTANT_MODEL);

  useEffect(() => {
    lastConversationId = conversationId;
  }, [conversationId]);

  const openConversation = (id: string) => {
    setConversationId(id);
    setShowList(false);
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
        <View className="min-w-0 flex-1 px-1">
          <Text numberOfLines={1} className="font-semibold text-base text-foreground">
            {showList ? "Chats" : conversationTitle(conversation ?? { title: "" })}
          </Text>
          {!showList && model && (
            <Text numberOfLines={1} className="text-muted-foreground text-xs">
              {model.label}
            </Text>
          )}
        </View>
        <IconButton
          icon={showList ? "message-circle" : "list"}
          label={showList ? "Back to chat" : "Show chats"}
          onPress={() => setShowList((value) => !value)}
          iconClassName="accent-muted-foreground"
        />
        <IconButton
          icon="edit"
          label="New chat"
          onPress={() => openConversation(generateId())}
          iconClassName="accent-muted-foreground"
        />
      </View>
      {showList && (
        <ConversationList conversations={conversations} activeId={conversationId} onOpen={openConversation} />
      )}
      {/* Hidden rather than unmounted, so the draft and an in-flight send survive a look at the list. */}
      <View className={showList ? "hidden" : "flex-1"}>
        <Chat key={conversationId} conversationId={conversationId} conversation={conversation} visible={!showList} />
      </View>
    </KeyboardAvoidingView>
  );
}

function ConversationList({
  conversations,
  activeId,
  onOpen,
}: {
  conversations: ConversationItem[];
  activeId: string;
  onOpen: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  if (conversations.length === 0) {
    return <EmptyState icon="message-circle" title="No chats yet" description="Start one with the compose button." />;
  }
  return (
    <FlatList
      data={conversations}
      keyExtractor={(row) => row.id}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      renderItem={({ item }) => {
        const status = conversationRowStatus(item);
        const updatedAt = new Date(item.updatedAt);
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(item.id)}
            className={`flex-row items-center gap-3 border-border border-b px-5 py-3 active:bg-muted ${
              item.id === activeId ? "bg-muted/60" : ""
            }`}
          >
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base text-foreground">
                {conversationTitle(item)}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {isToday(updatedAt) ? format(updatedAt, "HH:mm") : format(updatedAt, "MMM d")}
              </Text>
            </View>
            {status === "running" && <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />}
            {status === "unread" && <View className="size-2 rounded-full bg-primary" />}
            {status === "error" && <Icon name="alert-circle" size={16} colorClassName="accent-destructive" />}
          </Pressable>
        );
      }}
    />
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
  const [input, setInput] = useState("");
  const [submitLock, setSubmitLock] = useState<SubmitLock>();
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const nearBottomRef = useRef(true);
  const warmedRef = useRef(false);

  const isRunning = conversation?.turnStatus === "running";
  const hasMessage = submitLock != null && messages.some((message) => message.id === submitLock.messageId);
  const lockHolding = isSubmitLockHolding({ lock: submitLock, conversation, hasMessage });
  const isWorking = lockHolding || isRunning;
  const canStop = isRunning || (lockHolding && conversation !== null);
  const turnError = conversation?.turnStatus === "error" ? conversation.turnError : "";

  // Drop the lock once the turn has moved past it, so the next send starts clean.
  useEffect(() => {
    if (submitLock && !lockHolding) setSubmitLock(undefined);
  }, [submitLock, lockHolding]);

  // Viewing a chat marks its latest reply as read; not while the list covers it.
  const updatedAt = conversation?.updatedAt;
  useEffect(() => {
    if (visible && updatedAt != null) catchUpConversationLastRead(db.db, conversationId);
  }, [db, conversationId, updatedAt, visible]);

  // Older chats may predate the synced transcript; waking the agent backfills it.
  const needsBackfill = conversation != null && messages.length === 0 && !!conversation.title;
  useEffect(() => {
    if (!needsBackfill) return;
    void safe(api.assistant.ensureProjection({ conversationId }));
  }, [needsBackfill, conversationId]);

  // Wakes the agent while the user types, so its cold start overlaps composing.
  const warmAgent = () => {
    if (warmedRef.current || isWorking) return;
    warmedRef.current = true;
    void safe(api.assistant.ensureProjection({ conversationId }));
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || isWorking) return;

    setRpcError(null);
    const lock: SubmitLock = {
      kind: "sync",
      messageId: generateId(),
      submittedUpdatedAt: conversation?.updatedAt ?? null,
    };
    setSubmitLock(lock);
    setSending(true);
    nearBottomRef.current = true;

    const { error, data } = await safe(
      conversation
        ? api.assistant.submitTurn({ conversationId, turnId: lock.messageId, text })
        : api.assistant.startConversation({
            conversationId,
            turnId: lock.messageId,
            text,
            model: DEFAULT_ASSISTANT_MODEL,
            reasoningEffort: null,
          }),
    );
    setSending(false);
    if (error || !data.accepted) {
      setSubmitLock((current) => (current === lock ? undefined : current));
      if (error) setRpcError(rpcErrorMessage(error));
      return;
    }
    setInput("");
  };

  const cancel = async () => {
    const { error } = await safe(api.assistant.cancelTurn({ conversationId }));
    if (error) setRpcError(rpcErrorMessage(error));
    else setSubmitLock(undefined);
  };

  const errorMessage = rpcError ?? turnError;

  return (
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
          nearBottomRef.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height < STICK_TO_BOTTOM_THRESHOLD;
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
          <View className="flex-1 justify-center">
            <EmptyState
              icon="message-circle"
              title="Ask anything"
              description="About your notes, accounts, or plans."
            />
          </View>
        ) : (
          messages.map((message) => <MessageRow key={message.id} message={message} />)
        )}
        {isWorking && (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
            <Text className="text-muted-foreground text-sm">Thinking…</Text>
          </View>
        )}
      </ScrollView>

      {!!errorMessage && (
        <View className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-destructive text-xs">{errorMessage}</Text>
        </View>
      )}

      <View
        className="flex-row items-end gap-2 border-border border-t px-3 pt-2"
        style={{ paddingBottom: keyboardVisible ? 8 : insets.bottom + 8 }}
      >
        <Input
          value={input}
          onChangeText={(text) => {
            setInput(text);
            warmAgent();
          }}
          // Read-only while the send is in flight, so a failure can't clobber newer text.
          editable={!sending}
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
            disabled={isWorking || !input.trim()}
            className="bg-primary"
            iconClassName="accent-primary-foreground"
          />
        )}
      </View>
    </View>
  );
}

function MessageRow({ message }: { message: ConversationMessageItem }) {
  if (message.kind === "tool") {
    const failed = message.toolState === "error";
    return (
      <View className="flex-row items-center gap-1.5 self-start rounded-md border border-border bg-muted/50 px-2 py-1">
        <Icon
          name={failed ? "alert-circle" : "check"}
          size={12}
          colorClassName={failed ? "accent-destructive" : "accent-muted-foreground"}
        />
        <Text className="font-mono text-muted-foreground text-xs">{message.toolName || "tool"}</Text>
      </View>
    );
  }

  if (!message.text) return null;

  if (message.role === "user") {
    return (
      <View className="ml-12 self-end rounded-2xl bg-primary px-3.5 py-2">
        <Text selectable className="text-base text-primary-foreground">
          {message.text}
        </Text>
      </View>
    );
  }

  return (
    <Text selectable className="text-base text-foreground leading-6">
      {message.text}
    </Text>
  );
}
