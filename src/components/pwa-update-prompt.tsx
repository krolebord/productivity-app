import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { toast } from "sonner";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MIN_VISIBILITY_CHECK_GAP_MS = 15 * 60 * 1000;

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

      let lastCheckedAt = Date.now();
      const check = () => {
        lastCheckedAt = Date.now();
        // update() rejects while offline — a later check retries.
        registration.update().catch(() => {});
      };

      // Timers don't fire while the PWA is backgrounded, so checking on return
      // to the foreground is the primary mechanism; the gap guard keeps rapid
      // tab-switching from spamming checks.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (Date.now() - lastCheckedAt < MIN_VISIBILITY_CHECK_GAP_MS) return;
        check();
      });

      // Fallback for long-lived visible tabs that never change visibility.
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);
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
