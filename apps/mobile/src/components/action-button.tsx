import { Pressable, Text } from "react-native";
import { Icon, type IconName } from "./icon";

export function ActionButton({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card active:bg-muted"
    >
      <Icon name={icon} size={16} colorClassName={destructive ? "accent-destructive" : "accent-foreground"} />
      <Text className={`font-medium text-base ${destructive ? "text-destructive" : "text-foreground"}`}>{label}</Text>
    </Pressable>
  );
}
