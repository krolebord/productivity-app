import "../global.css";
// Applies the saved theme before the first frame.
import "../lib/preferences";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useUniwind } from "uniwind";
import { SessionProvider, useSession } from "../lib/session";

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { state } = useSession();

  useEffect(() => {
    if (state.status !== "loading") SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === "loading") return null;

  const signedIn = state.status === "signed-in";
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Follow the app's theme, not "auto": on Android the system color scheme can lag behind the
  // saved theme after a relaunch, leaving dark icons on a dark background.
  const { theme } = useUniwind();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <RootStack />
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
