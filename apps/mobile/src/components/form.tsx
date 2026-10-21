import type { ReactNode } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Icon } from "./icon";

export function FormSection({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <View className="gap-2">
      {title && <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</Text>}
      <View className="overflow-hidden rounded-xl border border-border bg-card">{children}</View>
      {footer && <Text className="px-1 text-muted-foreground text-xs">{footer}</Text>}
    </View>
  );
}

export function FormRow({
  label,
  children,
  onPress,
  last = false,
}: {
  label: string;
  children?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <>
      <Text className="text-base text-foreground">{label}</Text>
      <View className="ml-auto max-w-[65%] shrink flex-row items-center gap-2">
        {children}
        {onPress && <Icon name="chevron-right" size={18} colorClassName="accent-muted-foreground" />}
      </View>
    </>
  );
  const className = `min-h-12 flex-row items-center gap-3 px-4 py-2 ${last ? "" : "border-border border-b"}`;

  if (!onPress) return <View className={className}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className={`${className} active:bg-muted`}>
      {content}
    </Pressable>
  );
}

export function FormValue({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text numberOfLines={1} className={`shrink text-base ${muted ? "text-muted-foreground" : "text-foreground"}`}>
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
      <Switch value={value} onValueChange={onValueChange} trackColorOnClassName="accent-primary" />
    </FormRow>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text className="px-1 text-destructive text-sm">{message}</Text>;
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
      className={`min-h-12 flex-row items-center px-4 py-2 active:bg-muted ${last ? "" : "border-border border-b"}`}
    >
      <Text className="flex-1 text-base text-foreground">{label}</Text>
      {selected && <Icon name="check" size={18} colorClassName="accent-primary" />}
    </Pressable>
  );
}
