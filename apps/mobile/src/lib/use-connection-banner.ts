import { useConnectionBanner as useSharedConnectionBanner } from "@productivity/core/user-db/use-connection-banner";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** The shared banner state, paused while the app is in the background. */
export function useConnectionBanner() {
  const [active, setActive] = useState(() => AppState.currentState !== "background");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state !== "background"));
    return () => subscription.remove();
  }, []);

  return useSharedConnectionBanner({ active });
}
