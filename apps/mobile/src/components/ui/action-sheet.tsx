import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "./icon";

export type ActionSheetItem = {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

/** A non-draggable bottom menu shared across platforms. */
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
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [presented, setPresented] = useState(visible);
  // Mount on open; unmounting waits for the exit animation below.
  if (visible && !presented) setPresented(true);
  const [ready, setReady] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  // Keep the modal mounted through its exit animation. On iOS, native pickers and alerts must
  // wait for the modal's actual dismissal, rather than just the end of our visual animation.
  const pending = useRef<(() => void) | null>(null);
  const runPending = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);

  useEffect(() => {
    if (!presented || !ready || sheetHeight === 0) return;
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? 200 : 150,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!finished || visible) return;
      setPresented(false);
      setReady(false);
      setSheetHeight(0);
      if (Platform.OS !== "ios") runPending();
    });
    return () => animation.stop();
  }, [visible, presented, ready, sheetHeight, progress, reducedMotion, runPending]);

  return (
    <Modal
      visible={presented}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => setReady(true)}
      onRequestClose={onClose}
      onDismiss={runPending}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onClose}
          className="absolute inset-0"
          disabled={!visible}
        >
          <Animated.View pointerEvents="none" className="flex-1 bg-black/40" style={{ opacity: progress }} />
        </Pressable>
        <Animated.View
          accessibilityViewIsModal
          pointerEvents={visible ? "auto" : "none"}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
          className="overflow-hidden rounded-t-3xl bg-card pt-2"
          style={{
            maxHeight: height - insets.top - 16,
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight || height, 0] }) },
            ],
          }}
        >
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            {title && (
              <Text accessibilityRole="header" className="px-6 pt-3 pb-2 font-medium text-muted-foreground text-sm">
                {title}
              </Text>
            )}
            {items.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                accessibilityState={{ disabled: item.disabled }}
                disabled={item.disabled || !visible}
                onPress={() => {
                  pending.current = item.onPress;
                  onClose();
                }}
                className="min-h-14 flex-row items-center gap-4 px-6 py-3 active:bg-muted disabled:opacity-40"
              >
                <Icon
                  name={item.icon}
                  size={22}
                  colorClassName={item.destructive ? "accent-destructive" : "accent-foreground"}
                />
                <Text className={cn("flex-1 text-base", item.destructive ? "text-destructive" : "text-foreground")}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
