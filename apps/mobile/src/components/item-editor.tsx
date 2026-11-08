import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { Easing, FadeInDown, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../lib/utils";
import { Icon, type IconName } from "./ui/icon";

const panelLayout = LinearTransition.duration(180).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);
const panelEnter = FadeInDown.duration(180)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })
  .reduceMotion(ReduceMotion.System);
const panelExit = FadeOut.duration(120).reduceMotion(ReduceMotion.System);

/** Shared shell for autosaving tasks and notes. Actions stay reachable while typing. */
export function ItemEditor({
  title,
  onClose,
  children,
  toolbar,
  panel,
  scrollEnabled = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  toolbar: ReactNode;
  panel?: ReactNode;
  /** Off while a row is dragged. */
  scrollEnabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <View
        className="flex-row items-center gap-2 px-2 pb-2"
        style={{ paddingTop: Platform.OS === "ios" ? 10 : insets.top + 4 }}
      >
        <EditorAction icon="arrow-left" label="Back" onPress={onClose} />
        <Text numberOfLines={1} className="flex-1 font-medium text-foreground text-lg">
          {title}
        </Text>
      </View>
      <Animated.ScrollView
        layout={panelLayout}
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pt-3 pb-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        scrollEnabled={scrollEnabled}
      >
        {children}
      </Animated.ScrollView>
      {panel}
      <View
        className="flex-row items-center gap-1 border-border border-t bg-background px-3 pt-2"
        style={{ paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8) }}
      >
        {toolbar}
      </View>
    </KeyboardAvoidingView>
  );
}

export function EditorAction({
  icon,
  label,
  onPress,
  selected = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "min-h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-full px-3 active:bg-muted",
        selected && "bg-accent",
      )}
    >
      <Icon name={icon} size={21} colorClassName={selected ? "accent-accent-foreground" : "accent-foreground"} />
    </Pressable>
  );
}

/** An inline accessory panel keeps the editor and its toolbar in the same keyboard-aware view. */
export function EditorPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Animated.View
      entering={panelEnter}
      exiting={panelExit}
      layout={panelLayout}
      className="max-h-64 shrink border-border border-t bg-background"
    >
      <View className="flex-row items-center justify-between pr-2 pl-5">
        <Text className="font-medium text-base text-foreground">{title}</Text>
        <EditorAction icon="x" label={`Close ${title.toLowerCase()}`} onPress={onClose} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-4">
        {children}
      </ScrollView>
    </Animated.View>
  );
}

/** Existing values stay visible in the document, even when their editing panel is closed. */
export function EditorMetadata({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-12 max-w-full flex-row items-center gap-2 rounded-xl bg-muted px-3 py-2 active:opacity-70"
    >
      <Icon name={icon} size={16} colorClassName="accent-muted-foreground" />
      <Text className="shrink text-muted-foreground text-sm">{label}</Text>
    </Pressable>
  );
}
