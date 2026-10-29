import { useDb, useDbEvent, useDbState } from "@productivity/core/user-db/db-context";
import { useEffect, useState } from "react";
import { Alert, Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../lib/utils";
import { Icon } from "./ui/icon";

const SHOW_DELAY_MS = 1000;
const BACK_ONLINE_MS = 1000;

type Phase = "hidden" | "offline" | "back-online" | "leaving";

/**
 * Connection badge floating over the top of every screen, like web's: appears once the sync
 * connection has been down for a moment, flashes "Back online" when it returns, then slides away.
 * Local edits keep working throughout and push once the connection is back.
 */
export function OfflineBanner() {
  const { state } = useDb();
  const { remoteState } = useDbState();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [progress] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));

  const online = remoteState === "online";

  // Keyed on a boolean, so flips between "connecting" and "offline" during retries don't restart the delay.
  useEffect(() => {
    if (online) {
      setPhase((current) => (current === "offline" ? "back-online" : current));
      return;
    }
    setPhase((current) => (current === "back-online" || current === "leaving" ? "offline" : current));
    const timeout = setTimeout(() => setPhase("offline"), SHOW_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [online]);

  useEffect(() => {
    if (phase !== "back-online") return;
    const timeout = setTimeout(() => setPhase("leaving"), BACK_ONLINE_MS);
    return () => clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    if (phase === "hidden") return;
    const leaving = phase === "leaving";
    const animation = Animated.timing(progress, {
      toValue: leaving ? 0 : 1,
      duration: leaving ? 300 : 200,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && leaving) setPhase("hidden");
    });
    return () => animation.stop();
  }, [phase, progress]);

  const reconnecting = phase === "offline" && remoteState === "connecting";
  useEffect(() => {
    if (!reconnecting) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [reconnecting, spin]);

  if (phase === "hidden") return null;

  const offline = phase === "offline";

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 items-center px-4"
      style={{ paddingTop: insets.top + 4 }}
    >
      <Animated.View
        style={{
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={offline ? "You're offline. Tap to reconnect." : "Back online"}
          accessibilityState={{ busy: reconnecting, disabled: !offline }}
          disabled={!offline}
          onPress={() => void state.goOnline()}
          className={cn(
            "flex-row items-center gap-2 rounded-full border py-1.5 pr-3 pl-3.5 shadow-md active:opacity-80",
            offline
              ? "border-rose-500/30 bg-rose-50 dark:bg-rose-950"
              : "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950",
          )}
        >
          {offline ? (
            <>
              <Icon name="wifi-off" size={16} colorClassName="accent-rose-700 dark:accent-rose-300" />
              <Text className="text-rose-700 text-sm dark:text-rose-300">You're offline</Text>
              <Animated.View
                style={{
                  transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
                }}
              >
                <Icon name="refresh-cw" size={14} colorClassName="accent-rose-700 dark:accent-rose-300" />
              </Animated.View>
            </>
          ) : (
            <>
              <Icon name="wifi" size={16} colorClassName="accent-emerald-700 dark:accent-emerald-300" />
              <Text className="text-emerald-700 text-sm dark:text-emerald-300">Back online</Text>
            </>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function SyncStatusMonitor() {
  const db = useDb();

  useDbEvent("remote-schema-version-mismatch", () => {
    Alert.alert("Update required", "The server has a newer data format. Update the app to keep syncing.", [
      { text: "Later", style: "cancel" },
      { text: "Reload", onPress: () => void db.requestReload({ clean: false }) },
    ]);
  });

  useDbEvent("de-sync-detected", () => {
    Alert.alert("Your data is out of sync", "Reset local data and re-sync from the server.", [
      { text: "Later", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => void db.requestReload({ clean: true }) },
    ]);
  });

  return null;
}

const REMOTE_STATE_LABEL = { online: "Connected", connecting: "Connecting…", offline: "Offline" } as const;

/** Colored dot plus label for the sync connection. */
export function SyncStatus() {
  const { remoteState, deSynced } = useDbState();
  const color = deSynced
    ? "bg-rose-500"
    : remoteState === "online"
      ? "bg-emerald-500"
      : remoteState === "connecting"
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn("size-2 rounded-full", color)} />
      <Text className="text-muted-foreground text-sm">
        {deSynced ? "Out of sync" : REMOTE_STATE_LABEL[remoteState]}
      </Text>
    </View>
  );
}
