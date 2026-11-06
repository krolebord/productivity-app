import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Icon } from "./icon";

/** How long a tap's state is shown if `checked` never catches up (e.g. the write was ignored). */
const OPTIMISTIC_TIMEOUT_MS = 1500;

/**
 * Shows a tap's result on the next frame instead of after the write has re-rendered the screen,
 * then follows `checked` again as soon as it changes.
 */
function useOptimisticChecked(checked: boolean) {
  // `from` is the prop value at tap time; once `checked` moves off it, the prop is the truth again.
  const [optimistic, setOptimistic] = useState<{ value: boolean; from: boolean } | null>(null);
  const active = optimistic !== null && optimistic.from === checked;

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setOptimistic(null), OPTIMISTIC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const shown = active ? optimistic.value : checked;
  return [shown, (value: boolean) => setOptimistic({ value, from: checked })] as const;
}

export function CheckCircle({
  checked,
  onPress,
  label,
  disabled = false,
  optimistic = false,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  /** Show the flipped state right away; only for presses that always flip `checked`. */
  optimistic?: boolean;
}) {
  const [shown, setShown] = useOptimisticChecked(checked);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: shown, disabled }}
      hitSlop={10}
      onPress={() => {
        if (optimistic) setShown(!shown);
        onPress();
      }}
      disabled={disabled}
      className={`size-6 items-center justify-center rounded-full border-2 disabled:opacity-40 ${
        shown ? "border-primary bg-primary" : "border-muted-foreground/50"
      }`}
    >
      {shown && <Icon name="check" size={14} colorClassName="accent-primary-foreground" />}
    </Pressable>
  );
}
