import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "./icon";
import { Switch } from "./switch";

export function FormSection({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <View className="gap-2">
      {title && <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</Text>}
      <View className="overflow-hidden rounded-xl border border-border bg-card">{children}</View>
      {footer && <Text className="px-1 text-muted-foreground text-xs">{footer}</Text>}
    </View>
  );
}

// Icon glyphs are text, so screen readers would otherwise read them as part of the row label.
const decorative = { accessible: false, importantForAccessibility: "no", accessibilityElementsHidden: true } as const;

export function FormRow({
  label,
  icon,
  children,
  onPress,
  destructive = false,
  last = false,
}: {
  label: string;
  icon?: IconName;
  children?: ReactNode;
  onPress?: () => void;
  /** A red action row without a chevron, for actions that discard something (behind a confirm). */
  destructive?: boolean;
  last?: boolean;
}) {
  const content = (
    <>
      {icon && <Icon name={icon} size={18} colorClassName="accent-muted-foreground" {...decorative} />}
      <Text className={cn("text-base", destructive ? "text-destructive" : "text-foreground")}>{label}</Text>
      <View className="ml-auto max-w-[65%] shrink flex-row items-center gap-2">
        {children}
        {onPress && !destructive && (
          <Icon name="chevron-right" size={18} colorClassName="accent-muted-foreground" {...decorative} />
        )}
      </View>
    </>
  );
  // Barely any vertical padding, so rows holding a 40pt input or a date pill stay 48pt like plain
  // ones and the dividers in a card stay evenly spaced.
  const className = cn("min-h-12 flex-row items-center gap-3 px-4 py-0.5", !last && "border-border border-b");

  if (!onPress) return <View className={className}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className={cn(className, "active:bg-muted")}>
      {content}
    </Pressable>
  );
}

export function FormValue({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text numberOfLines={1} className={cn("shrink text-base", muted ? "text-muted-foreground" : "text-foreground")}>
      {children}
    </Text>
  );
}

export function FormSwitch({
  label,
  value,
  onValueChange,
  last,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <FormRow label={label} last={last}>
      <Switch value={value} onValueChange={onValueChange} />
    </FormRow>
  );
}

export function FieldError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return <Text className={cn("px-1 text-destructive text-sm", className)}>{message}</Text>;
}

export function FormOption({
  label,
  selected,
  onPress,
  last = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={cn("min-h-12 flex-row items-center px-4 py-2 active:bg-muted", !last && "border-border border-b")}
    >
      <Text className="flex-1 text-base text-foreground">{label}</Text>
      {selected && <Icon name="check" size={18} colorClassName="accent-primary" />}
    </Pressable>
  );
}
