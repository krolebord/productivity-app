import { safe } from "@orpc/client";
import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
import { deviceTimeZone as readDeviceTimeZone, timeZoneMismatch } from "@productivity/core/time-zone";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { api } from "../lib/api";
import { getPreferences, setPreference } from "../lib/preferences";

/** The device's zone, read again whenever the app returns to the foreground (e.g. after travel). */
export function useDeviceTimeZone() {
  const [timeZone, setTimeZone] = useState(readDeviceTimeZone);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setTimeZone(readDeviceTimeZone());
    });
    return () => subscription.remove();
  }, []);
  return timeZone;
}

/**
 * Mirrors the web's watcher: saves the device's timezone when none is saved yet (Calendar sync and
 * MCP read it on the server), and offers to switch when this device's zone differs from the saved
 * one. A kept saved→device pair is not offered again on this device.
 */
export function TimeZoneWatcher() {
  const { timeZone: savedTimeZone, setTimeZone } = useDashboardSettings();
  const deviceTimeZone = useDeviceTimeZone();
  const initRequested = useRef(false);
  const promptedKey = useRef<string | null>(null);

  // The server decides whether the zone is unset: an empty local value may just not have synced yet.
  // A failed request (offline) is retried on the next launch.
  useEffect(() => {
    if (savedTimeZone || initRequested.current) return;
    initRequested.current = true;
    void safe(api.settings.initTimeZone({ timeZone: deviceTimeZone }));
  }, [savedTimeZone, deviceTimeZone]);

  useEffect(() => {
    const mismatch = timeZoneMismatch(savedTimeZone, deviceTimeZone);
    if (!mismatch) return;
    if (getPreferences().dismissedTimeZoneMismatch === mismatch.key || promptedKey.current === mismatch.key) return;
    promptedKey.current = mismatch.key;

    Alert.alert(
      "This device is in a different timezone",
      `Saved: ${mismatch.saved}. This device: ${mismatch.device}. Switch the saved timezone?`,
      [
        { text: "Keep", style: "cancel", onPress: () => setPreference("dismissedTimeZoneMismatch", mismatch.key) },
        { text: "Switch", onPress: () => setTimeZone(mismatch.device) },
      ],
    );
  }, [savedTimeZone, deviceTimeZone, setTimeZone]);

  return null;
}
