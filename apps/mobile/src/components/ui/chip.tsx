import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "./icon";

export function Chip({
  label,
  count,
  selected = false,
  onPress,
  onLongPress,
  tone = "default",
  accessibilityLabel,
}: {
  label: string;
  /** When the visible label is shortened, as a weekday's "Fri". */
  accessibilityLabel?: string;
  count?: number;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  tone?: "default" | "excluded";
}) {
  const container =
    tone === "excluded"
      ? "border-destructive/50 bg-destructive/10"
      : selected
        ? "border-primary bg-primary"
        : "border-border bg-card";
  const text =
    tone === "excluded" ? "text-destructive line-through" : selected ? "text-primary-foreground" : "text-foreground";
  const countText =
    tone === "excluded" ? "text-destructive/70" : selected ? "text-primary-foreground/80" : "text-muted-foreground";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? (count != null ? `${label}, ${count}` : undefined)}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      className={`h-8 flex-row items-center gap-1.5 rounded-full border px-3 active:opacity-70 ${container}`}
    >
      <Text className={`text-sm ${text}`}>{label}</Text>
      {count != null && <Text className={`text-xs tabular-nums ${countText}`}>{count}</Text>}
    </Pressable>
  );
}

/**
 * A compact trigger for a picker, like the web transaction editor's chips: a muted fill once it
 * holds a value, a bare "+ Label" until then. RN can't inherit text colour from the container,
 * so tinted chips pass their text and icon colours separately.
 */
export function PickerChip({
  label,
  icon,
  leading,
  chevron = false,
  empty = false,
  onPress,
  accessibilityLabel,
  className,
  textClassName,
  iconClassName,
}: {
  label: string;
  /** Defaults to a plus while empty. */
  icon?: IconName;
  /** Drawn instead of the icon, e.g. a colour dot. */
  leading?: ReactNode;
  chevron?: boolean;
  empty?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  className?: string;
  textClassName?: string;
  iconClassName?: string;
}) {
  const iconName = icon ?? (empty ? "plus" : undefined);
  return (
    <Pressable
      accessibilityRole="button"
      // The plus glyph is text, so without a label VoiceOver would read it as part of the chip's.
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      className={cn(
        "h-10 min-w-0 max-w-full shrink flex-row items-center gap-1.5 rounded-lg px-3",
        empty ? "active:bg-muted" : "bg-muted active:opacity-70",
        className,
      )}
    >
      {leading ??
        (iconName && (
          <Icon
            name={iconName}
            size={14}
            colorClassName={cn(empty ? "accent-muted-foreground" : "accent-foreground", iconClassName)}
          />
        ))}
      <Text
        numberOfLines={1}
        className={cn("shrink text-[15px]", empty ? "text-muted-foreground" : "text-foreground", textClassName)}
      >
        {label}
      </Text>
      {chevron && <Icon name="chevron-down" size={14} colorClassName="accent-muted-foreground" />}
    </Pressable>
  );
}
