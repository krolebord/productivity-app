import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
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

/**
 * How much of the screen's bottom the keyboard covers, with the keyboard's own animation on iOS.
 *
 * The editors reach the screen's bottom edge, so that's the distance from the keyboard's top to the
 * bottom of the screen. RN's KeyboardAvoidingView instead compares its own frame, relative to its
 * parent, with the keyboard's top in screen coordinates; inside an iOS sheet, which starts below the
 * top of the screen, those disagree by the sheet's offset, and the bottom bar ended up behind the
 * keyboard. Not the keyboard's `height` either: Android leaves out the navigation bar under it,
 * which the edge-to-edge editor also extends behind.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(() => {
    const metrics = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
    return metrics ? coveredBy(metrics.screenY) : 0;
  });
  useEffect(() => {
    const follow = (shown: boolean) => (event: KeyboardEvent) => {
      if (Platform.OS === "ios" && event.duration > 0) {
        LayoutAnimation.configureNext({
          duration: event.duration,
          update: { duration: event.duration, type: LayoutAnimation.Types[event.easing] ?? "keyboard" },
        });
      }
      setInset(shown ? coveredBy(event.endCoordinates.screenY) : 0);
    };
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", follow(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", follow(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return inset;
}

function coveredBy(keyboardTop: number) {
  return Math.max(Dimensions.get("screen").height - keyboardTop, 0);
}

/**
 * Editor layout shared by tasks, notes and transactions: a header, scrolling content, an optional
 * inline panel, and a bottom bar that rides on the keyboard so its actions stay under the thumb.
 */
export function EditorShell({
  header,
  children,
  toolbar,
  panel,
  scrollEnabled = true,
  contentClassName,
  toolbarClassName,
}: {
  header: ReactNode;
  children: ReactNode;
  toolbar: ReactNode;
  panel?: ReactNode;
  /** Off while a row is dragged. */
  scrollEnabled?: boolean;
  contentClassName?: string;
  toolbarClassName?: string;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  return (
    <View className="flex-1 bg-background" style={{ paddingBottom: keyboardInset }}>
      {header}
      <Animated.ScrollView
        layout={panelLayout}
        className="flex-1"
        contentContainerClassName={cn("grow gap-5 px-5 pt-3 pb-6", contentClassName)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        scrollEnabled={scrollEnabled}
      >
        {children}
      </Animated.ScrollView>
      {panel}
      <View
        className={cn("flex-row items-center gap-1 border-border border-t bg-background px-3 pt-2", toolbarClassName)}
        style={{ paddingBottom: keyboardInset > 0 ? 8 : Math.max(insets.bottom, 8) }}
      >
        {toolbar}
      </View>
    </View>
  );
}

/** Shared shell for autosaving tasks and notes. Actions stay reachable while typing. */
export function ItemEditor({
  title,
  onClose,
  ...shell
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  toolbar: ReactNode;
  panel?: ReactNode;
  scrollEnabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <EditorShell
      {...shell}
      header={
        <View
          className="flex-row items-center gap-2 px-2 pb-2"
          style={{ paddingTop: Platform.OS === "ios" ? 10 : insets.top + 4 }}
        >
          <EditorAction icon="arrow-left" label="Back" onPress={onClose} />
          <Text numberOfLines={1} className="flex-1 font-medium text-foreground text-lg">
            {title}
          </Text>
        </View>
      }
    />
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
