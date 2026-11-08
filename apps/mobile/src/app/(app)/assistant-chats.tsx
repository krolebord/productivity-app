import { useConversations } from "@productivity/core/data/conversations";
import { generateId } from "@sqlite-sync/core";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { ConversationList, useDeleteConversation } from "../../components/assistant/conversation-list";
import { ScreenHeader } from "../../components/screen-header";
import { IconButton } from "../../components/ui/icon-button";
import { setPreference, usePreference } from "../../lib/preferences";

/**
 * The assistant's chat history, a page pushed over the open chat: back (chevron, swipe or
 * Android's back) returns to it, and picking a row switches the chat under it, then goes back.
 */
export default function AssistantChatsScreen() {
  const router = useRouter();
  const conversations = useConversations();
  const deleteConversation = useDeleteConversation();
  const activeId = usePreference("assistantConversationId") ?? "";

  const open = (id: string) => {
    setPreference("assistantConversationId", id);
    router.back();
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Chats"
        onBack={router.back}
        actions={
          <IconButton
            icon="edit"
            label="New chat"
            onPress={() => open(generateId())}
            iconClassName="accent-muted-foreground"
          />
        }
      />
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onOpen={open}
        onNew={() => open(generateId())}
        onDelete={(id) => deleteConversation(id, conversations)}
      />
    </View>
  );
}
