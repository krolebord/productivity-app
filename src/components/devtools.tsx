import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { orpc } from "@/orpc/orpc-client";

const SQLiteSyncDevtools = lazy(() => import("@sqlite-sync/devtools").then((m) => ({ default: m.SQLiteSyncDevtools })));

/**
 * Renders the SQLite sync devtools for admins (or always in dev). The devtools read the active
 * db from a global registry, so this works anywhere — including the root error page, which renders
 * outside the `_app` route's `DbProvider`.
 */
export function Devtools() {
  const queryClient = useQueryClient();
  // Read-only cache lookup: never trigger a fetch from the error page.
  const auth = queryClient.getQueryData(orpc.auth.getAuth.queryOptions().queryKey);
  const showDevtools = import.meta.env.DEV || auth?.userRole === "admin";

  if (!showDevtools) {
    return null;
  }

  return (
    <Suspense>
      <SQLiteSyncDevtools />
    </Suspense>
  );
}
