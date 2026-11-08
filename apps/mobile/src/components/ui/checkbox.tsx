import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Canvas, Path, Skia } from "react-native-skia";
import { useCSSVariable } from "uniwind";
import { cn } from "../../lib/utils";
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

/**
 * The square box on its own, for rows that handle the press themselves (tag picker, checklist
 * items). Squares are for ticking things off and picking; circles are for habits that fill up
 * (see docs/design-principles.md).
 */
export function CheckboxIndicator({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <View
      className={cn(
        "size-5 items-center justify-center rounded-[5px] border-2",
        checked ? "border-primary bg-primary" : "border-muted-foreground",
        className,
      )}
    >
      {checked && <Icon name="check" size={14} colorClassName="accent-primary-foreground" />}
    </View>
  );
}

type CheckProps = {
  checked: boolean;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  /** Show the flipped state right away; only for presses that always flip `checked`. */
  optimistic?: boolean;
};

/** A square checkbox: tasks and simple (done / not done) habits, as on web. */
export function Checkbox({ checked, onPress, label, disabled = false, optimistic = false }: CheckProps) {
  const [shown, setShown] = useOptimisticChecked(checked);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: shown, disabled }}
      hitSlop={12}
      onPress={() => {
        if (optimistic) setShown(!shown);
        onPress();
      }}
      disabled={disabled}
      className="disabled:opacity-40"
    >
      <CheckboxIndicator checked={shown} />
    </Pressable>
  );
}

const CIRCLE_SIZE = 20;
const CIRCLE_BORDER = 2;
const PIE_INSET = 2;

/**
 * A habit with a target above one: a circle that fills clockwise from the top as progress is
 * logged, then shows a check once done, like web's counted habits.
 */
export function HabitCheck({
  checked,
  progress,
  onPress,
  label,
  disabled = false,
}: Omit<CheckProps, "optimistic"> & { progress: number }) {
  const primary = useCSSVariable("--color-primary") as string | undefined;
  const ratio = Math.max(0, Math.min(1, progress));
  const inner = CIRCLE_SIZE - CIRCLE_BORDER * 2;
  const pie = useMemo(() => {
    if (ratio <= 0 || ratio >= 1) return null;
    const oval = Skia.XYWHRect(PIE_INSET, PIE_INSET, inner - PIE_INSET * 2, inner - PIE_INSET * 2);
    return Skia.PathBuilder.Make()
      .moveTo(inner / 2, inner / 2)
      .arcToOval(oval, -90, 360 * ratio, false)
      .close()
      .detach();
  }, [ratio, inner]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      hitSlop={12}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        "size-5 items-center justify-center rounded-full border-2 disabled:opacity-40",
        checked ? "border-primary bg-primary" : "border-muted-foreground",
      )}
    >
      {checked ? (
        <Icon name="check" size={14} colorClassName="accent-primary-foreground" />
      ) : (
        pie &&
        primary && (
          <Canvas pointerEvents="none" style={{ width: inner, height: inner }}>
            <Path path={pie} color={primary} />
          </Canvas>
        )
      )}
    </Pressable>
  );
}
