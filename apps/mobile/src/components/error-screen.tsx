import type { ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button } from "./ui/button";

/**
 * Shown instead of the app when rendering throws; exported from the root layout as its
 * `ErrorBoundary`. It replaces the whole tree, providers included, so it only uses what works
 * without them. Data is safe: edits are saved as they're made, not held by the screens.
 */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error("The app failed to render", error);
    // A crash during startup would otherwise leave the splash screen up over this.
    SplashScreen.hideAsync().catch(() => {});
  }, [error]);

  return (
    <View className="flex-1 justify-center gap-6 bg-background px-6">
      <View className="gap-2">
        <Text className="font-semibold text-foreground text-xl">Something went wrong</Text>
        <Text className="text-base text-muted-foreground">
          The app hit an error it couldn't recover from. Your data is saved on this device.
        </Text>
      </View>
      <ScrollView className="max-h-40 grow-0 rounded-lg bg-muted" contentContainerClassName="p-3">
        <Text selectable className="font-mono text-muted-foreground text-xs">
          {error.message || String(error)}
        </Text>
      </ScrollView>
      <View className="gap-2">
        <Button label="Try again" onPress={() => void retry()} />
        {/* For an error that comes straight back: a fresh start of the JS, like relaunching. */}
        <Button
          label="Restart the app"
          variant="ghost"
          // Not available in a development build, where Metro's reload does the same.
          onPress={() => void Updates.reloadAsync().catch(() => retry())}
        />
      </View>
    </View>
  );
}
