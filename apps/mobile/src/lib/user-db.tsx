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

type OpenUserDb = { userId: string; db: Promise<SyncedDb<UserDb>>; ui: boolean };

/**
 * The one synced DB this JS runtime has open. The screens and the background widget refresh share
 * it: a second instance would be a second sync engine over the same file.
 */
let current: OpenUserDb | null = null;

/** Opens the DB for the screens, taking over one a background refresh has open for the same user. */
function openForUi(userId: string): OpenUserDb {
  if (current && !current.ui && current.userId === userId) current.ui = true;
  else current = { userId, db: initUserDb(userId), ui: true };
  return current;
}

function releaseFromUi(entry: OpenUserDb) {
  if (current === entry) current = null;
  void entry.db.then(
    (db) => db.dispose(),
    () => {},
  );
}

/**
 * Runs `run` with the user's DB outside the UI: the one the screens have open if there is one,
 * otherwise one opened for the call and disposed after it, unless the screens took it over
 * meanwhile (Android attaches the UI to a runtime that was started headless). Resolves undefined
 * without running when another user's DB is open.
 */
export async function withBackgroundUserDb<T>(
  userId: string,
  run: (db: SyncedDb<UserDb>) => Promise<T>,
): Promise<T | undefined> {
  current ??= { userId, db: initUserDb(userId), ui: false };
  const entry = current;
  if (entry.userId !== userId) return undefined;
  try {
    return await run(await entry.db);
  } finally {
    if (!entry.ui) {
      if (current === entry) current = null;
      await entry.db.then(
        (db) => db.dispose(),
        () => {},
      );
    }
  }
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
    let unsubscribe: (() => void) | undefined;

    setState({ status: "loading" });
    const entry = openForUi(userId);
    entry.db.then(
      (db) => {
        if (cancelled) return;
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
      releaseFromUi(entry);
    };
  }, [userId, epoch]);

  if (state.status === "loading") return fallback;
  if (state.status === "error") return renderError(state.error, () => setEpoch((value) => value + 1));
  return <DbProvider db={state.db}>{children}</DbProvider>;
}
