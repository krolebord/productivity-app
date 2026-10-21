import { useDb, useDbEvent, useDbState } from "@productivity/core/user-db/db-context";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Icon } from "./icon";

const SHOW_DELAY_MS = 1500;

/** Pill shown while the sync connection is down; local edits keep working and push once it's back. */
export function OfflineBanner() {
  const db = useDb();
  const { remoteState } = useDbState();
  const online = remoteState === "online";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (online) {
      setVisible(false);
      return;
    }
    const timeout = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [online]);

  if (!visible) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Offline. Tap to reconnect."
      onPress={() => db.state.sync()}
      className="mx-5 mb-2 flex-row items-center gap-2 rounded-full border border-rose-500/30 bg-rose-50 px-3.5 py-1.5 active:opacity-80 dark:bg-rose-950"
    >
      <Icon name="wifi-off" size={14} colorClassName="accent-rose-700 dark:accent-rose-300" />
      <Text className="flex-1 text-rose-700 text-sm dark:text-rose-300" numberOfLines={1}>
        {remoteState === "connecting" ? "Reconnecting…" : "Offline — changes will sync later"}
      </Text>
      <Icon name="refresh-cw" size={13} colorClassName="accent-rose-700 dark:accent-rose-300" />
    </Pressable>
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

export function SyncDot() {
  const { remoteState } = useDbState();
  const color =
    remoteState === "online" ? "bg-emerald-500" : remoteState === "connecting" ? "bg-amber-500" : "bg-rose-500";
  return <View className={`size-2 rounded-full ${color}`} />;
}
