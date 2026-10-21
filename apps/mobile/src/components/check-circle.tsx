import { Pressable } from "react-native";
import { Icon } from "./icon";

export function CheckCircle({
  checked,
  onPress,
  label,
  disabled = false,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      hitSlop={10}
      onPress={onPress}
      disabled={disabled}
      className={`size-6 items-center justify-center rounded-full border-2 disabled:opacity-40 ${
        checked ? "border-primary bg-primary" : "border-muted-foreground/50"
      }`}
    >
      {checked && <Icon name="check" size={14} colorClassName="accent-primary-foreground" />}
    </Pressable>
  );
}
