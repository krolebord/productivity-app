import { useRouter } from "expo-router";
import { Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "./ui/icon";

// Distance from the safe-area bottom to just above the native tab bar.
const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 66 : 96;
const BUTTON_SIZE = 56;

/** Bottom padding for tab screens' scroll content: clears the tab bar and the assistant button. */
export function useTabContentInset() {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_CLEARANCE + BUTTON_SIZE + 16;
}

/** Floating button over the tabs that opens the full-screen assistant. */
export function AssistantButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open assistant"
      onPress={() => router.push("/assistant")}
      className="absolute right-5 size-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
      style={{ bottom: insets.bottom + TAB_BAR_CLEARANCE }}
    >
      <Icon name="message-circle" size={24} colorClassName="accent-primary-foreground" />
    </Pressable>
  );
}
