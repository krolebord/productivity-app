import type { AttachRef } from "@productivity/core/agent/attach";
import { isConversationUnread } from "@productivity/core/conversation-list";
import { useConversations } from "@productivity/core/data/conversations";
import { useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { attachToAssistant, startConversationId } from "../lib/assistant-chats";
import { setPreference } from "../lib/preferences";
import { useSession } from "../lib/session";
import { Icon } from "./ui/icon";

// Distance from the safe-area bottom to just above the native tab bar.
const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 66 : 96;
const BUTTON_SIZE = 56;

/** Bottom padding for tab screens' scroll content: clears the tab bar and the assistant button. */
export function useTabContentInset() {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_CLEARANCE + BUTTON_SIZE + 16;
}

/**
 * Floating button over the tabs that opens the assistant on a chat: a new one, or the last one
 * while it's still in play.
 */
export function AssistantButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const conversations = useConversations();
  const unread = conversations.filter(isConversationUnread).length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Open assistant, ${unread} unread chats` : "Open assistant"}
      onPress={() => {
        const id = startConversationId(conversations);
        setPreference("assistantConversationId", id);
        router.push("/assistant");
      }}
      className="absolute right-5 size-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
      style={{ bottom: insets.bottom + TAB_BAR_CLEARANCE }}
    >
      <Icon name="message-circle" size={24} colorClassName="accent-primary-foreground" />
      {unread > 0 && (
        <View className="absolute -top-1 -right-1 h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-primary px-1">
          <Text className="font-medium text-primary-foreground text-xs">{unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function useAssistantEnabled() {
  const { state } = useSession();
  return state.status === "signed-in" && state.user.assistantEnabled;
}

/**
 * Attaches a row to the assistant's composer and opens it on that chat, the mobile take on the
 * web's Cmd-click. Returns to an assistant already under the current screen (a transaction opened
 * from a chat) instead of stacking a second one.
 */
export function useAskAssistant() {
  const router = useRouter();
  return (ref: AttachRef) => {
    attachToAssistant(ref);
    router.dismissTo("/assistant");
  };
}
