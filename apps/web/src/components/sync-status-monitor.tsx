import { useDb, useDbEvent } from "@productivity/core/user-db/db-context";
import { toast } from "sonner";
import { useAppUpdate } from "@/components/app-update-provider";

export function SyncStatusMonitor() {
  const db = useDb();
  const reportDatabaseUpdate = useAppUpdate();

  useDbEvent("remote-schema-version-mismatch", () => {
    reportDatabaseUpdate(() => db.requestReload({ clean: false }));
  });

  useDbEvent("de-sync-detected", () => {
    toast.error("Your data is out of sync", {
      id: "sync-de-sync",
      description: "Reload to reset your local data and re-sync from the server.",
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Reload & reset",
        onClick: () => db.requestReload({ clean: true }),
      },
    });
  });

  return null;
}
