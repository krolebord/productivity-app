import { Pressable, Text } from "react-native";

export function Chip({
  label,
  count,
  selected = false,
  onPress,
  onLongPress,
  tone = "default",
}: {
  label: string;
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
      accessibilityLabel={count != null ? `${label}, ${count}` : undefined}
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
