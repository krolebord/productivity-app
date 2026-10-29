import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Modal body: header pinned on top, scrollable content that stays clear of the keyboard.
 * `automaticallyAdjustKeyboardInsets` (iOS) insets the scroll view by the keyboard and scrolls
 * the focused field into view; a KeyboardAvoidingView only shrank it, leaving fields low in the
 * form (a habit's unit, a transaction's notes) typed into behind the keyboard.
 */
export function KeyboardScreen({ header, children }: { header: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </View>
  );
}
