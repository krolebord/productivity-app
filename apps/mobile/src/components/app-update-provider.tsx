import { useSegments } from "expo-router";
import * as Updates from "expo-updates";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./ui/button";

const CHECK_GAP_MS = 15 * 60 * 1000;
const RestartBlockers = createContext<((token: symbol, blocked: boolean) => void) | null>(null);

/** Keep a quick-add draft intact even if the keyboard has been dismissed or its tab is hidden. */
export function useDeferAppUpdate(blocked: boolean) {
  const setBlocked = useContext(RestartBlockers);
  const [token] = useState(() => Symbol("update-restart-blocker"));
  useEffect(() => {
    setBlocked?.(token, blocked);
    return () => setBlocked?.(token, false);
  }, [blocked, setBlocked, token]);
}

/** Native launch checks stay automatic; foreground checks and restarting never block app startup. */
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { isUpdatePending, isChecking, isDownloading } = Updates.useUpdates();
  const segments: string[] = useSegments();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const [blockers, setBlockers] = useState<Set<symbol>>(() => new Set());
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState(false);
  // Native code checks at cold launch. Don't immediately duplicate that request in JS.
  const [lastCheck] = useState(() => ({ at: Date.now(), inFlight: false }));
  const appState = useRef(AppState.currentState);
  const enabled = !__DEV__ && Updates.isEnabled;

  const setBlocked = useCallback((token: symbol, blocked: boolean) => {
    setBlockers((current) => {
      if (current.has(token) === blocked) return current;
      const next = new Set(current);
      if (blocked) next.add(token);
      else next.delete(token);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (next) => {
      const returning = next === "active" && appState.current !== "active";
      appState.current = next;
      setActive(next === "active");
      if (!returning || isUpdatePending || isChecking || isDownloading || lastCheck.inFlight) return;
      if (Date.now() - lastCheck.at < CHECK_GAP_MS) return;
      lastCheck.at = Date.now();
      lastCheck.inFlight = true;
      void (async () => {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable || update.isRollBackToEmbedded) await Updates.fetchUpdateAsync();
        } catch {
          // Offline and failed downloads stay quiet; a later foreground check retries.
        } finally {
          lastCheck.inFlight = false;
        }
      })();
    });
    return () => subscription.remove();
  }, [enabled, isChecking, isDownloading, isUpdatePending, lastCheck]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Editors flush autosave on unmount. Wait until the user leaves them themselves;
  // other forms and the assistant may also have unsaved input, so only offer this on the tabs.
  const safeToRestart = segments[0] === "(app)" && segments[1] === "(tabs)" && !keyboardVisible && !blockers.size;
  const visible = enabled && active && isUpdatePending && !dismissed && safeToRestart;
  const restart = async () => {
    if (!visible || restarting || AppState.currentState !== "active" || Keyboard.isVisible()) return;
    setRestarting(true);
    setError(false);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
      setError(true);
    }
  };

  return (
    <RestartBlockers.Provider value={setBlocked}>
      {children}
      {visible && (
        <View
          accessibilityLiveRegion="polite"
          className="absolute inset-x-4 gap-3 rounded-xl border border-border bg-card p-4 shadow-md"
          style={{ bottom: insets.bottom + 76 }}
        >
          <Text className="font-semibold text-base text-foreground">An update is ready</Text>
          <Text className="text-muted-foreground text-sm">
            {error
              ? "Couldn't restart. Try again, or close and reopen the app later."
              : "Restart to use the latest version."}
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Later" variant="ghost" onPress={() => setDismissed(true)} disabled={restarting} />
            </View>
            <View className="flex-1">
              <Button label="Restart" onPress={() => void restart()} loading={restarting} />
            </View>
          </View>
        </View>
      )}
    </RestartBlockers.Provider>
  );
}
