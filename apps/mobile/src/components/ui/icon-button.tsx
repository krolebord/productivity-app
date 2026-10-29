import { Pressable } from "react-native";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "./icon";

export function IconButton({
  icon,
  label,
  onPress,
  className,
  iconClassName = "accent-foreground",
  size = 20,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  className?: string;
  iconClassName?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      disabled={disabled}
      className={cn("size-10 items-center justify-center rounded-full active:bg-muted disabled:opacity-40", className)}
    >
      <Icon name={icon} size={size} colorClassName={iconClassName} />
    </Pressable>
  );
}
