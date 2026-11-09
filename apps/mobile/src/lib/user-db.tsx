import { DbProvider } from "@productivity/core/user-db/db-context";
import { syncDbSchema, type UserDb } from "@productivity/core/user-db/migrations";
import { createSyncedDb, createWsRemoteSource, type SyncedDb } from "@sqlite-sync/react-native";
import { type ReactNode, useEffect, useState } from "react";
import { startWidgetPublishing } from "../widgets/session";
import { getApiSessionToken } from "./api";
import { userDbSyncUrl } from "./config";

// React Native's WebSocket takes a third options argument for headers; the DOM lib types don't know it.
const NativeWebSocket = WebSocket as unknown as new (
  url: string,
  protocols: string[] | null,
  options: { headers: Record<string, string> },
) => WebSocket;

function initUserDb(userId: string) {
  return createSyncedDb({
    dbId: `user-${userId}`,
    syncDbSchema,
    storageVersion: "1",
    verifySchema: __DEV__,
    createRemoteSource: createWsRemoteSource({
      createWebSocket: () => {
        const token = getApiSessionToken();
        return new NativeWebSocket(userDbSyncUrl(userId), null, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      },
    }),
  });
}

type UserDbState =
  | { status: "loading" }
  | { status: "ready"; db: SyncedDb<UserDb> }
  | { status: "error"; error: Error };

/** Opens the signed-in user's synced database and reopens it whenever the engine requests a reload. */
export function UserDbProvider({
  userId,
  fallback,
  renderError,
  children,
}: {
  userId: string;
  fallback: ReactNode;
  renderError: (error: Error, retry: () => void) => ReactNode;
  children: ReactNode;
}) {
  const [state, setState] = useState<UserDbState>({ status: "loading" });
  const [epoch, setEpoch] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: bumping `epoch` is how a reload or retry reopens the database.
  useEffect(() => {
    let cancelled = false;
    let opened: SyncedDb<UserDb> | null = null;
    let unsubscribe: (() => void) | undefined;

    setState({ status: "loading" });
    initUserDb(userId).then(
      (db) => {
        if (cancelled) {
          void db.dispose();
          return;
        }
        opened = db;
        const stopReload = db.subscribe("reload-requested", () => setEpoch((value) => value + 1)).unsubscribe;
        const stopWidgets = startWidgetPublishing(db);
        unsubscribe = () => {
          stopReload();
          stopWidgets();
        };
        setState({ status: "ready", db });
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error("Failed to open the user database", error);
        setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
      void opened?.dispose();
    };
  }, [userId, epoch]);

  if (state.status === "loading") return fallback;
  if (state.status === "error") return renderError(state.error, () => setEpoch((value) => value + 1));
  return <DbProvider db={state.db}>{children}</DbProvider>;
}
