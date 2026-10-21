import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function AuthScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerClassName="grow justify-center px-6"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-semibold text-3xl text-foreground">{title}</Text>
        <Text className="mt-2 text-base text-muted-foreground">{description}</Text>
        <View className="mt-8 gap-3">{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
