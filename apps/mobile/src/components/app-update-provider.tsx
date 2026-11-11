import { useSegments } from "expo-router";
import * as Updates from "expo-updates";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./ui/button";

const CHECK_GAP_MS = 15 * 60 * 1000;
const RestartBlockers = createContext<((token: symbol, blocked: boolean) => void) | null>(null);
const SchemaMismatch = createContext<((required: boolean) => void) | null>(null);
type DownloadStatus = "idle" | "checking" | "downloading" | "ready" | "unavailable" | "error";
type ManualCheck = {
  enabled: boolean;
  status: "idle" | "checking" | "ready" | "up-to-date" | "error";
  check: () => void;
};
const ManualCheck = createContext<ManualCheck | null>(null);

/** For a "Check for updates" control: an update it finds downloads and offers the usual restart banner. */
export function useAppUpdateCheck() {
  const context = useContext(ManualCheck);
  if (!context) throw new Error("useAppUpdateCheck must be used inside AppUpdateProvider");
  return context;
}

/** Read the DB's durable state, including mismatches detected before this monitor mounted. */
export function useSchemaUpdateRequired(required: boolean) {
  const report = useContext(SchemaMismatch);
  useEffect(() => {
    report?.(required);
    return () => report?.(false);
  }, [required, report]);
}

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
  const [schemaMismatch, setSchemaMismatch] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState(false);
  // Native code checks at cold launch. Don't immediately duplicate that request in JS.
  const [lastCheck] = useState(() => ({ at: Date.now(), inFlight: false }));
  const appState = useRef(AppState.currentState);
  const enabled = !__DEV__ && Updates.isEnabled;
  const pending = isUpdatePending || downloadStatus === "ready";
  const downloading = isChecking || isDownloading || downloadStatus === "checking" || downloadStatus === "downloading";

  const reportSchemaMismatch = useCallback((required: boolean) => {
    setSchemaMismatch(required);
    if (!required) return;
    setDismissed(false);
    // An earlier routine check that found nothing (or failed) mustn't stop the mismatch's own check.
    setDownloadStatus((current) => (current === "unavailable" || current === "error" ? "idle" : current));
  }, []);

  const download = useCallback(async () => {
    if (!enabled || pending || isChecking || isDownloading || lastCheck.inFlight) return;
    lastCheck.at = Date.now();
    lastCheck.inFlight = true;
    setDownloadStatus("checking");
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable && !update.isRollBackToEmbedded) {
        setDownloadStatus("unavailable");
        return;
      }
      setDownloadStatus("downloading");
      const fetched = await Updates.fetchUpdateAsync();
      setDownloadStatus(fetched.isNew || fetched.isRollBackToEmbedded ? "ready" : "unavailable");
    } catch {
      // Routine checks stay quiet; a schema mismatch shows an error and allows retrying.
      setDownloadStatus("error");
    } finally {
      lastCheck.inFlight = false;
    }
  }, [enabled, pending, isChecking, isDownloading, lastCheck]);

  // A mismatch means newer code exists: fetch it right away instead of waiting for a tap. Waits out
  // the native launch check (which may already be downloading it) and runs once; retries are the button.
  useEffect(() => {
    if (schemaMismatch && downloadStatus === "idle" && !isChecking && !isDownloading) void download();
  }, [schemaMismatch, downloadStatus, isChecking, isDownloading, download]);

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
      if (!returning || pending || downloading || lastCheck.inFlight) return;
      if (Date.now() - lastCheck.at < CHECK_GAP_MS) return;
      void download();
    });
    return () => subscription.remove();
  }, [enabled, pending, downloading, download, lastCheck]);

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
  const visible = active && safeToRestart && (schemaMismatch || (enabled && pending && !dismissed));
  const restart = async () => {
    if (!visible || !pending || restarting || AppState.currentState !== "active" || Keyboard.isVisible()) return;
    setRestarting(true);
    setError(false);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
      setError(true);
    }
  };

  let description = schemaMismatch
    ? "Syncing is paused. Update the app to resume syncing. Your changes are saved on this device."
    : "Restart to use the latest version.";
  if (schemaMismatch && !enabled) {
    description =
      "Syncing is paused. Install the latest app version to resume syncing. Your changes are saved on this device.";
  } else if (schemaMismatch && pending) {
    description = "Syncing is paused. Restart to update the app and resume syncing.";
  } else if (schemaMismatch && downloadStatus === "unavailable") {
    description =
      "No update is available for this installation yet. Try again later or install the latest app version. Syncing stays paused.";
  } else if (schemaMismatch && downloadStatus === "error") {
    description = "Couldn't download the update. Check your internet connection and try again. Syncing stays paused.";
  }
  if (error) description = "Couldn't restart. Try again, or close and reopen the app later.";
  const action = pending ? "Restart" : downloading ? "Updating…" : "Update";
  const manualCheck: ManualCheck = {
    enabled,
    status: pending
      ? "ready"
      : downloading
        ? "checking"
        : downloadStatus === "unavailable"
          ? "up-to-date"
          : downloadStatus === "error"
            ? "error"
            : "idle",
    check: () => {
      setDismissed(false);
      void download();
    },
  };

  return (
    <RestartBlockers.Provider value={setBlocked}>
      <SchemaMismatch.Provider value={reportSchemaMismatch}>
        <ManualCheck.Provider value={manualCheck}>{children}</ManualCheck.Provider>
        {visible && (
          <View
            accessibilityLiveRegion="polite"
            className="absolute inset-x-4 gap-3 rounded-xl border border-border bg-card p-4 shadow-md"
            style={{ bottom: insets.bottom + 76 }}
          >
            <Text className="font-semibold text-base text-foreground">
              {pending ? "An update is ready" : "Update required"}
            </Text>
            <Text className="text-muted-foreground text-sm">{description}</Text>
            <View className="flex-row gap-2">
              {!schemaMismatch && (
                <View className="flex-1">
                  <Button label="Later" variant="ghost" onPress={() => setDismissed(true)} disabled={restarting} />
                </View>
              )}
              <View className="flex-1">
                <Button
                  label={action}
                  accessibilityLabel={action}
                  onPress={() => void (pending ? restart() : download())}
                  loading={restarting || downloading}
                  disabled={!enabled}
                />
              </View>
            </View>
          </View>
        )}
      </SchemaMismatch.Provider>
    </RestartBlockers.Provider>
  );
}
