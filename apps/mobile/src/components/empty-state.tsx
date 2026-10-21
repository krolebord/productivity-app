import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Icon, type IconName } from "./icon";

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <View className="items-center gap-2 px-8 py-12">
      <View className="mb-1 size-12 items-center justify-center rounded-full bg-muted">
        <Icon name={icon} size={22} colorClassName="accent-muted-foreground" />
      </View>
      <Text className="text-center font-medium text-base text-foreground">{title}</Text>
      {description && <Text className="text-center text-muted-foreground text-sm">{description}</Text>}
      {children}
    </View>
  );
}
