import { Stack } from "expo-router";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { OfflineBanner, SyncStatusMonitor } from "../../components/sync-status";
import { TimeZoneWatcher } from "../../components/time-zone-watcher";
import { Button } from "../../components/ui/button";
import { useSession } from "../../lib/session";
import { UserDbProvider } from "../../lib/user-db";

// A cold widget/deep-link launch must still have somewhere to go when the editor closes,
// including the system Back action. Keep the tabs beneath directly opened screens.
export const unstable_settings = { anchor: "(tabs)" };

// Item editors and other layers over the app (see docs/design-principles.md): a native sheet on
// iOS, a short fade-and-rise on Android, which reads as "on top" rather than "deeper".
const modal = {
  presentation: "modal",
  animation: Platform.OS === "android" ? "fade_from_bottom" : undefined,
} as const;

export default function AppLayout() {
  const { state } = useSession();
  const background = useCSSVariable("--color-background") as string | undefined;

  if (state.status !== "signed-in") return null;

  return (
    <UserDbProvider
      userId={state.user.userId}
      fallback={
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      }
      renderError={(error, retry) => (
        <View className="flex-1 justify-center gap-4 bg-background px-6">
          <Text className="font-semibold text-foreground text-xl">Couldn't open your data</Text>
          <Text className="text-muted-foreground">{error.message}</Text>
          <Button label="Try again" onPress={retry} />
        </View>
      )}
    >
      <SyncStatusMonitor />
      <TimeZoneWatcher />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="transactions" />
        <Stack.Screen name="search" />
        <Stack.Screen name="habits" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="integrations" />
        <Stack.Screen name="rates" />
        {/* A place you stay, not a layer: a push with swipe-back on iOS (a sheet's swipe-down would
            fight scrolling up the chat), the same fade-and-rise as the editors on Android. The chat
            and the Chats list are two views of it, so back always leaves the assistant. */}
        <Stack.Screen
          name="assistant"
          options={{ animation: Platform.OS === "android" ? "fade_from_bottom" : "default" }}
        />
        <Stack.Screen name="agents" />
        <Stack.Screen name="memories" />
        <Stack.Screen name="skills" />
        <Stack.Screen name="task/[id]" options={modal} />
        <Stack.Screen name="note/[id]" options={modal} />
        <Stack.Screen name="habit/[id]" options={modal} />
        <Stack.Screen name="transaction/[id]" options={modal} />
        <Stack.Screen name="account/[id]" options={modal} />
        <Stack.Screen name="category-importance" options={modal} />
        <Stack.Screen name="mcp-token" options={modal} />
        <Stack.Screen name="monobank-token" options={modal} />
      </Stack>
      {/* After the stack so it floats over every screen pushed on it. */}
      <OfflineBanner />
    </UserDbProvider>
  );
}
