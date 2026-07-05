import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { toast } from "sonner";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Registers the service worker and shows a persistent toast when a new build
// is waiting. The app always boots from the cached version; updating is an
// explicit user action so a session is never hot-swapped underneath them.
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        // update() rejects while offline — the next interval retries.
        registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast("A new version is available", {
      id: "pwa-update",
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Update",
        onClick: () => updateServiceWorker(true),
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
