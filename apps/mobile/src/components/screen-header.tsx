import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../lib/utils";
import { useInFormSheet } from "./ui/form-sheet";
import { Icon } from "./ui/icon";
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

/**
 * Header for screens presented as modals and for form sheets: iOS sheets and every FormSheet sit
 * below the status bar, Android's full-screen modals don't.
 *
 * Cancel is a ✕ on both platforms (Material's full-screen dialog, iOS 26 sheets); a custom
 * `cancelLabel` such as "Clear all" is an action rather than a dismissal, so it stays text.
 * Confirm is a filled ✓ on iOS, as in iOS 26 sheets, and text on Android, as in Material;
 * `doneLabel` is its accessibility label on iOS.
 */
export function SheetHeader({
  title,
  onCancel,
  cancelLabel,
  onDone,
  doneLabel = "Done",
  doneDisabled = false,
  donePending = false,
}: {
  title: string;
  onCancel?: () => void;
  cancelLabel?: string;
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  /** Shows a spinner in place of the confirm button while its action runs. */
  donePending?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const inSheet = useInFormSheet();
  return (
    <View
      className="flex-row items-center border-border border-b bg-background px-2 pb-2"
      style={{ paddingTop: Platform.OS === "ios" || inSheet ? 10 : insets.top + 6 }}
    >
      <View className="flex-1 items-start">
        {onCancel &&
          (cancelLabel ? (
            <HeaderTextButton label={cancelLabel} onPress={onCancel} />
          ) : (
            <IconButton icon="x" label="Cancel" onPress={onCancel} size={22} />
          ))}
      </View>
      <Text numberOfLines={1} className="max-w-[55%] font-semibold text-base text-foreground">
        {title}
      </Text>
      <View className="flex-1 items-end">
        {onDone &&
          (donePending ? (
            <View className="size-10 items-center justify-center">
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            </View>
          ) : Platform.OS === "ios" ? (
            <ConfirmIconButton label={doneLabel} onPress={onDone} disabled={doneDisabled} />
          ) : (
            <HeaderTextButton label={doneLabel} onPress={onDone} disabled={doneDisabled} bold />
          ))}
      </View>
    </View>
  );
}

/** iOS 26's sheet confirm: a ✓ in a filled accent circle, outlined and muted while disabled. */
function ConfirmIconButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className={cn(
        "size-10 items-center justify-center rounded-full",
        disabled ? "border border-border" : "bg-primary active:opacity-80",
      )}
    >
      <Icon
        name="check"
        size={22}
        colorClassName={disabled ? "accent-muted-foreground" : "accent-primary-foreground"}
      />
    </Pressable>
  );
}

export function HeaderTextButton({
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
