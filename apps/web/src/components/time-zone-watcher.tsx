import { deviceTimeZone as readDeviceTimeZone, timeZoneMismatch } from "@productivity/core/time-zone";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDashboardSettings } from "@/lib/dashboard-settings";
import { orpc } from "@/orpc/orpc-client";

const TIME_ZONE_TOAST_ID = "time-zone-mismatch";
const DISMISSED_MISMATCH_KEY = "productivity-time-zone-dismissed";

/**
 * Saves the device's timezone when none is saved yet, and offers to switch when this device's zone
 * differs from the saved one. A dismissed saved→device pair is not offered again on this device.
 */
export function TimeZoneWatcher() {
  const { timeZone: savedTimeZone, setTimeZone } = useDashboardSettings();
  const [deviceTimeZone] = useState(readDeviceTimeZone);
  const { mutate: initTimeZone } = useMutation(orpc.settings.initTimeZone.mutationOptions());
  const initRequested = useRef(false);

  // The server decides whether the zone is unset: an empty local value may just not have synced yet.
  useEffect(() => {
    if (savedTimeZone || initRequested.current) return;
    initRequested.current = true;
    initTimeZone({ timeZone: deviceTimeZone });
  }, [savedTimeZone, deviceTimeZone, initTimeZone]);

  useEffect(() => {
    if (!savedTimeZone) return;
    const mismatch = timeZoneMismatch(savedTimeZone, deviceTimeZone);
    if (!mismatch) {
      toast.dismiss(TIME_ZONE_TOAST_ID);
      return;
    }

    if (localStorage.getItem(DISMISSED_MISMATCH_KEY) === mismatch.key) return;
    const dismiss = () => localStorage.setItem(DISMISSED_MISMATCH_KEY, mismatch.key);

    toast.info("This device is in a different timezone", {
      id: TIME_ZONE_TOAST_ID,
      description: `Saved: ${mismatch.saved}. This device: ${mismatch.device}. Switch the saved timezone?`,
      duration: Number.POSITIVE_INFINITY,
      action: { label: "Switch", onClick: () => setTimeZone(deviceTimeZone) },
      cancel: { label: "Keep", onClick: dismiss },
      onDismiss: dismiss,
    });
  }, [savedTimeZone, deviceTimeZone, setTimeZone]);

  return null;
}
