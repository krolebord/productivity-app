import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { create } from "zustand";
import { orpc } from "@/orpc/orpc-client";

const SQLiteSyncDevtools = lazy(() => import("@sqlite-sync/devtools").then((m) => ({ default: m.SQLiteSyncDevtools })));

export const useDevtoolsStore = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function useCanOpenDevtools() {
  const queryClient = useQueryClient();
  // Read-only cache lookup: never trigger a fetch from the error page.
  const auth = queryClient.getQueryData(orpc.auth.getAuth.queryOptions().queryKey);
  return auth?.userRole === "admin";
}

/**
 * Renders the SQLite sync devtools dialog for admins, opened via `useDevtoolsStore`. The devtools
 * read the active db from a global registry, so this works anywhere — including the root error
 * page, which renders outside the `_app` route's `DbProvider`.
 */
export function Devtools() {
  const canOpen = useCanOpenDevtools();
  const open = useDevtoolsStore((s) => s.open);
  const setOpen = useDevtoolsStore((s) => s.setOpen);

  if (!canOpen || !open) {
    return null;
  }

  return (
    <Suspense>
      <SQLiteSyncDevtools launcher={false} open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
