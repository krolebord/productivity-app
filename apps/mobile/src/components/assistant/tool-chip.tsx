import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "../ui/icon";

/** The small bordered pill tool calls render as, optionally pressable. */
export function ToolChip({
  icon,
  failed = false,
  label,
  detail,
  mono = false,
  onPress,
  accessibilityLabel,
  children,
}: {
  icon: IconName;
  failed?: boolean;
  label: string;
  detail?: string | null;
  /** Raw tool names read as code, as on the web. */
  mono?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const content = (
    <>
      <Icon
        name={failed ? "alert-circle" : icon}
        size={12}
        colorClassName={failed ? "accent-destructive" : "accent-muted-foreground"}
      />
      <Text className={cn("shrink-0 text-muted-foreground text-xs", mono && "font-mono")}>{label}</Text>
      {detail ? (
        <Text numberOfLines={1} className="min-w-0 shrink text-muted-foreground/80 text-xs">
          {detail}
        </Text>
      ) : null}
      {children}
    </>
  );
  const className =
    "max-w-full flex-row items-center gap-1.5 self-start rounded-md border border-border bg-muted/50 px-2 py-1";
  if (!onPress) return <View className={className}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={cn(className, "active:bg-muted")}
    >
      {content}
    </Pressable>
  );
}

export function ToolErrorChip({ label }: { label: string }) {
  return <ToolChip icon="alert-circle" failed label={label} />;
}
