import { useDb, useDbEvent, useDbState } from "@productivity/core/user-db/db-context";
import { useEffect, useState } from "react";
import { Alert, Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "../lib/config";
import { useConnectionBanner } from "../lib/use-connection-banner";
import { cn } from "../lib/utils";
import { useSchemaUpdateRequired } from "./app-update-provider";
import { Icon } from "./ui/icon";

/**
 * Connection badge floating over the top of every screen, like web's: appears once the sync
 * connection has been down for a few seconds, flashes "Back online" when it returns, then slides away.
 * Local edits keep working throughout and push once the connection is back.
 */
export function OfflineBanner() {
  const { phase, offline, reconnecting, reconnect, onLeft } = useConnectionBanner();
  const { schemaVersionMismatched } = useDbState();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (phase === "hidden") return;
    const leaving = phase === "leaving";
    const animation = Animated.timing(progress, {
      toValue: leaving ? 0 : 1,
      duration: leaving ? 300 : 200,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && leaving) onLeft();
    });
    return () => animation.stop();
  }, [phase, progress, onLeft]);

  if (phase === "hidden") return null;

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
          accessibilityLabel={
            schemaVersionMismatched
              ? "Syncing paused. App update required."
              : offline
                ? "You're offline. Tap to reconnect."
                : "Back online"
          }
          accessibilityState={{ busy: reconnecting, disabled: !offline || schemaVersionMismatched }}
          disabled={!offline || schemaVersionMismatched}
          onPress={reconnect}
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
              <Text className="text-rose-700 text-sm dark:text-rose-300">
                {schemaVersionMismatched ? "Syncing paused · Update required" : "You're offline"}
              </Text>
              {!schemaVersionMismatched && (
                <Icon name="refresh-cw" size={14} colorClassName="accent-rose-700 dark:accent-rose-300" />
              )}
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
  const { schemaVersionMismatched } = useDbState();
  useSchemaUpdateRequired(schemaVersionMismatched);

  useDbEvent("de-sync-detected", () => {
    Alert.alert("Your data is out of sync", "Reset local data and re-sync from the server.", [
      { text: "Later", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => void db.requestReload({ clean: true }) },
    ]);
  });

  return null;
}

const REMOTE_STATE_LABEL = { online: "Connected", connecting: "Connecting…", offline: "Offline" } as const;

const REMOTE_STATE_DETAIL = {
  online: "Changes sync in the background as you make them.",
  connecting: "Trying to reach the server. Your changes are saved on this device and sync once it's back.",
  offline: "Not syncing right now. Your changes are saved on this device and sync once you're back online.",
} as const;

/**
 * The sync connection's label and dot color, plus `showDetails`, which explains the state and
 * offers the matching fix: sync or pause when connected, retry when not, reset when the data diverged.
 */
export function useSyncStatus() {
  const db = useDb();
  const { remoteState, deSynced, schemaVersionMismatched } = useDbState();
  const color = schemaVersionMismatched
    ? "bg-amber-500"
    : deSynced
      ? "bg-rose-500"
      : remoteState === "online"
        ? "bg-emerald-500"
        : remoteState === "connecting"
          ? "bg-amber-500"
          : "bg-rose-500";
  const label = schemaVersionMismatched
    ? "Update required"
    : deSynced
      ? "Out of sync"
      : REMOTE_STATE_LABEL[remoteState];
  const host = API_URL.replace(/^https?:\/\//, "");

  const showDetails = () => {
    if (schemaVersionMismatched) {
      Alert.alert(
        "Syncing paused",
        "Update the app from a main tab to resume syncing. Your changes are saved on this device.",
      );
      return;
    }
    if (deSynced) {
      Alert.alert(
        "Your data is out of sync",
        "This device's copy no longer matches the server. Reset local data to download it again; changes that haven't synced yet are lost.",
        [
          { text: "Later", style: "cancel" },
          { text: "Reset local data", style: "destructive", onPress: () => void db.requestReload({ clean: true }) },
        ],
      );
      return;
    }
    const message = `${REMOTE_STATE_DETAIL[remoteState]}\n\nServer: ${host}`;
    if (remoteState === "online") {
      Alert.alert(label, message, [
        { text: "Close", style: "cancel" },
        { text: "Go offline", onPress: () => void db.state.goOffline() },
        { text: "Sync now", onPress: () => db.state.sync() },
      ]);
      return;
    }
    Alert.alert(label, message, [
      { text: "Close", style: "cancel" },
      { text: remoteState === "offline" ? "Go online" : "Retry now", onPress: () => void db.state.goOnline() },
    ]);
  };

  return { label, color, showDetails };
}

/** Colored dot plus label, for rows that handle the tap themselves (Settings' Status row). */
export function SyncStatusLabel({ label, color }: { label: string; color: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn("size-2 rounded-full", color)} />
      <Text className="text-base text-muted-foreground">{label}</Text>
    </View>
  );
}

/** Tappable sync badge that opens the details from `useSyncStatus`. */
export function SyncStatus() {
  const { label, color, showDetails } = useSyncStatus();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}`}
      accessibilityHint="Shows details and sync actions"
      onPress={showDetails}
      hitSlop={8}
      className="flex-row items-center gap-1.5 rounded-full py-1 active:opacity-60"
    >
      <View className={cn("size-2 rounded-full", color)} />
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Icon name="chevron-right" size={14} colorClassName="accent-muted-foreground" />
    </Pressable>
  );
}
