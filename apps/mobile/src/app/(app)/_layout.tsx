import { Stack } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { OfflineBanner, SyncStatusMonitor } from "../../components/sync-status";
import { TimeZoneWatcher } from "../../components/time-zone-watcher";
import { Button } from "../../components/ui/button";
import { useSession } from "../../lib/session";
import { UserDbProvider } from "../../lib/user-db";

const modal = { presentation: "modal" } as const;

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
        <Stack.Screen name="habits" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="integrations" />
        <Stack.Screen name="rates" />
        <Stack.Screen name="assistant" />
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
