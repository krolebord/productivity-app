import "../global.css";
// Applies the saved theme before the first frame.
import "../lib/preferences";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useCSSVariable, useUniwind } from "uniwind";
import { AppUpdateProvider } from "../components/app-update-provider";
import { SessionProvider, useSession } from "../lib/session";
import { publishSignedOutWidgets } from "../widgets/refresh";

// Expo Router renders this in place of the app when a screen throws while rendering.
export { ErrorScreen as ErrorBoundary } from "../components/error-screen";

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { state } = useSession();

  useEffect(() => {
    if (state.status !== "loading") SplashScreen.hideAsync();
    // Signed in, the user DB publishes the widgets (UserDbProvider); signed out, they say "Sign in".
    if (state.status === "signed-out") publishSignedOutWidgets();
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
  const baseTheme = theme === "dark" ? DarkTheme : DefaultTheme;
  const [background, card, text, primary, border, notification] = useCSSVariable([
    "--color-background",
    "--color-card",
    "--color-foreground",
    "--color-primary",
    "--color-border",
    "--color-destructive",
  ]) as (string | undefined)[];
  // Native stack transitions expose the navigator's background around the moving screens.
  // Styling screen content alone leaves that surface on the default light navigation theme.
  const navigationTheme = {
    ...baseTheme,
    colors: {
      background: background ?? baseTheme.colors.background,
      card: card ?? baseTheme.colors.card,
      text: text ?? baseTheme.colors.text,
      primary: primary ?? baseTheme.colors.primary,
      border: border ?? baseTheme.colors.border,
      notification: notification ?? baseTheme.colors.notification,
    },
  };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: navigationTheme.colors.background }}>
      <KeyboardProvider>
        <ThemeProvider value={navigationTheme}>
          <SessionProvider>
            <AppUpdateProvider>
              <RootStack />
            </AppUpdateProvider>
            <StatusBar style={theme === "dark" ? "light" : "dark"} />
          </SessionProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
