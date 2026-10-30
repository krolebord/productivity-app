import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./ui/icon-button";

export function ScreenHeader({
  title,
  subtitle,
  actions,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Shows a back chevron, for screens pushed over the tabs. */
  onBack?: () => void;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // Children (search fields, segmented controls) share the 20pt gutter of the content below;
  // only the back chevron pulls out to hug the edge.
  return (
    <View className="gap-3 bg-background px-5 pb-3" style={{ paddingTop: insets.top + 12 }}>
      {/* The 40pt back and action buttons centre on the 36pt title line (nudged 2pt down so the
          two line up), not on the title and subtitle together. */}
      <View className={`flex-row items-start gap-2 ${onBack ? "-ml-3" : ""}`}>
        {onBack && <IconButton icon="chevron-left" label="Back" onPress={onBack} size={26} />}
        <View className="min-w-0 flex-1 pt-0.5">
          <Text numberOfLines={1} className="font-semibold text-3xl text-foreground">
            {title}
          </Text>
          {subtitle && <Text className="mt-0.5 text-muted-foreground">{subtitle}</Text>}
        </View>
        {actions && <View className="h-10 flex-row items-center gap-1">{actions}</View>}
      </View>
      {children}
    </View>
  );
}

/** Header for screens presented as modals: iOS sheets sit below the status bar, Android modals don't. */
export function SheetHeader({
  title,
  onCancel,
  cancelLabel = "Cancel",
  onDone,
  doneLabel = "Done",
  doneDisabled = false,
}: {
  title: string;
  onCancel?: () => void;
  cancelLabel?: string;
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center border-border border-b bg-background px-2 pb-2"
      style={{ paddingTop: Platform.OS === "ios" ? 10 : insets.top + 6 }}
    >
      <View className="flex-1 items-start">
        {onCancel && <HeaderTextButton label={cancelLabel} onPress={onCancel} />}
      </View>
      <Text numberOfLines={1} className="max-w-[55%] font-semibold text-base text-foreground">
        {title}
      </Text>
      <View className="flex-1 items-end">
        {onDone && <HeaderTextButton label={doneLabel} onPress={onDone} disabled={doneDisabled} bold />}
      </View>
    </View>
  );
}

function HeaderTextButton({
  label,
  onPress,
  disabled = false,
  bold = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  bold?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className="h-10 justify-center px-3 active:opacity-60 disabled:opacity-40"
    >
      <Text className={`text-base text-primary ${bold ? "font-semibold" : ""}`}>{label}</Text>
    </Pressable>
  );
}
