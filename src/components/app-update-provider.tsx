import { useRegisterSW } from "virtual:pwa-register/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MIN_VISIBILITY_CHECK_GAP_MS = 15 * 60 * 1000;
const APP_UPDATE_TOAST_ID = "app-update";

type DatabaseReload = () => Promise<void>;

const AppUpdateContext = createContext<((reloadDatabase: DatabaseReload) => void) | null>(null);

// Registers the service worker and owns the single prompt for both a waiting
// app build and a synced-database schema mismatch. If both occur, the service
// worker activates first and its controlling event then reloads every DB tab.
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const databaseReloadRef = useRef<DatabaseReload | null>(null);
  const [databaseUpdateAvailable, setDatabaseUpdateAvailable] = useState(false);
  const {
    needRefresh: [serviceWorkerUpdateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload() {
      const reloadDatabase = databaseReloadRef.current;
      if (reloadDatabase) {
        void reloadDatabase();
        return;
      }
      window.location.reload();
    },
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

  const reportDatabaseUpdate = useCallback((reloadDatabase: DatabaseReload) => {
    databaseReloadRef.current = reloadDatabase;
    setDatabaseUpdateAvailable(true);
  }, []);

  useEffect(() => {
    if (!serviceWorkerUpdateAvailable && !databaseUpdateAvailable) return;

    toast.warning("A new version is available", {
      id: APP_UPDATE_TOAST_ID,
      description: "Update to the latest version to keep syncing changes.",
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Update",
        onClick: () => {
          if (serviceWorkerUpdateAvailable) {
            void updateServiceWorker();
            return;
          }
          void databaseReloadRef.current?.();
        },
      },
    });
  }, [databaseUpdateAvailable, serviceWorkerUpdateAvailable, updateServiceWorker]);

  return <AppUpdateContext.Provider value={reportDatabaseUpdate}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdate() {
  const reportDatabaseUpdate = useContext(AppUpdateContext);
  if (!reportDatabaseUpdate) {
    throw new Error("useAppUpdate must be used within AppUpdateProvider");
  }
  return reportDatabaseUpdate;
}
