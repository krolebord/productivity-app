import { useCallback, useEffect, useState } from "react";
import { useDb, useDbState } from "./db-context";

/** How long the sync connection must stay down before the offline banner appears. */
const SHOW_DELAY_MS = 3000;
/** How long "Back online" stays up before it starts leaving. */
const BACK_ONLINE_MS = 1000;

export type ConnectionBannerPhase = "hidden" | "offline" | "back-online" | "leaving";

/**
 * State for the floating connection banner on web and mobile. It appears only once the sync
 * connection has been down for `SHOW_DELAY_MS`, so quick reconnects never flash it. When the
 * connection returns it shows "Back online" (only if the offline banner was actually shown),
 * then enters `leaving`. The UI plays its exit animation and calls `onLeft` when it finishes.
 */
export function useConnectionBanner() {
  const { state } = useDb();
  const { remoteState } = useDbState();
  const [phase, setPhase] = useState<ConnectionBannerPhase>("hidden");

  const online = remoteState === "online";

  // Keyed on a boolean, so flips between "connecting" and "offline" during retries don't restart the delay.
  useEffect(() => {
    if (online) {
      setPhase((current) => (current === "offline" ? "back-online" : current));
      return;
    }
    // The banner is already on screen, so switch back to offline right away instead of hiding and reshowing it.
    setPhase((current) => (current === "back-online" || current === "leaving" ? "offline" : current));
    const timeout = setTimeout(() => setPhase("offline"), SHOW_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [online]);

  useEffect(() => {
    if (phase !== "back-online") return;
    const timeout = setTimeout(() => setPhase("leaving"), BACK_ONLINE_MS);
    return () => clearTimeout(timeout);
  }, [phase]);

  const onLeft = useCallback(() => setPhase((current) => (current === "leaving" ? "hidden" : current)), []);
  const reconnect = useCallback(() => void state.goOnline(), [state]);

  return {
    phase,
    offline: phase === "offline",
    reconnecting: phase === "offline" && remoteState === "connecting",
    reconnect,
    onLeft,
  };
}
