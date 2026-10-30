import { useRef } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "./icon";

export type ActionSheetItem = {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
};

/** A menu of actions sliding up from the bottom, the mobile stand-in for the web's "…" dropdowns. */
export function ActionSheet({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  title?: string;
  items: readonly ActionSheetItem[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  // iOS can't present a view controller (a picker, a share sheet) while this modal is still
  // animating out, so there the chosen action waits for the dismissal to finish.
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={runPending}>
      <View className="flex-1 justify-end">
        {/* A sibling of the panel, not its parent, so VoiceOver can still reach each action. */}
        <Pressable accessibilityLabel="Close menu" onPress={onClose} className="absolute inset-0 bg-black/40" />
        <View className="gap-2 px-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="overflow-hidden rounded-2xl bg-card">
            {title && (
              <Text className="border-border border-b px-4 py-3 text-center text-muted-foreground text-xs uppercase tracking-wide">
                {title}
              </Text>
            )}
            {items.map((item, index) => (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                accessibilityState={{ disabled: item.disabled }}
                disabled={item.disabled}
                onPress={() => {
                  onClose();
                  if (Platform.OS === "ios") pending.current = item.onPress;
                  else item.onPress();
                }}
                className={cn(
                  "min-h-14 flex-row items-center gap-3 px-4 active:bg-muted disabled:opacity-40",
                  index < items.length - 1 && "border-border border-b",
                )}
              >
                <Icon name={item.icon} size={18} colorClassName="accent-foreground" />
                <Text className="text-base text-foreground">{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="min-h-14 items-center justify-center rounded-2xl bg-card active:bg-muted"
          >
            <Text className="font-semibold text-base text-primary">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
