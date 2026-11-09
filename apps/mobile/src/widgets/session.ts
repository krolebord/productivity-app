import { addLocalDays } from "@productivity/core/agenda";
import { localMidnightMs } from "@productivity/core/date-time";
import type { UserDb } from "@productivity/core/user-db/migrations";
import type { RecordedQuery } from "@productivity/core/widgets/reader";
import type { SyncedDb } from "@sqlite-sync/react-native";
import { AppState } from "react-native";
import { refreshWidgets } from "./refresh";

/** How long edits settle before widgets are rebuilt; typing in a note autosaves far more often. */
const CHANGE_DEBOUNCE_MS = 2_000;
/** The first sync counts as settled once no events have arrived for this long while online… */
const SYNC_QUIET_MS = 1_000;
/** …or after this long regardless (offline, or a slow first pull), so widgets show local data. */
const SYNC_TIMEOUT_MS = 10_000;

/**
 * Resolves once the first sync after opening has settled. Publishing right on open showed an
 * empty widget on a fresh start: the pull hadn't arrived yet (docs/widgets-research.md).
 */
function waitForInitialSync(db: SyncedDb<UserDb>) {
  return new Promise<void>((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(quiet);
      clearTimeout(timeout);
      stopState();
      stopChunks();
      resolve();
    };
    const restartQuiet = () => {
      clearTimeout(quiet);
      if (db.state.getState().remoteState === "online") quiet = setTimeout(finish, SYNC_QUIET_MS);
    };
    const timeout = setTimeout(finish, SYNC_TIMEOUT_MS);
    const stopState = db.state.subscribe(restartQuiet);
    const stopChunks = db.subscribe("new-event-chunk-applied", restartQuiet).unsubscribe;
    restartQuiet();
  });
}

/**
 * Keeps the home-screen widgets current while a user DB is open: publishes once the first sync
 * settles, again (debounced) whenever a query a widget was built from changes, at local midnight,
 * when the app returns to the foreground, and right away when it goes to the background. Returns
 * a function that stops it; signing out publishes the signed-out state separately.
 */
export function startWidgetPublishing(db: SyncedDb<UserDb>): () => void {
  let stopped = false;
  let ready = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let midnight: ReturnType<typeof setTimeout> | undefined;
  const watched = new Map<string, () => void>();

  const refresh = () => {
    clearTimeout(debounce);
    if (stopped) return;
    try {
      watch(refreshWidgets(db.db));
    } catch (error) {
      console.warn("Couldn't refresh the widgets", error);
    }
    scheduleMidnight();
  };

  const refreshSoon = (delay = CHANGE_DEBOUNCE_MS) => {
    if (stopped || !ready) return;
    clearTimeout(debounce);
    debounce = setTimeout(refresh, delay);
  };

  // Watch exactly the queries the snapshots were read from; their parameters move with the day,
  // so the set is reconciled after every refresh.
  const watch = (queries: RecordedQuery[]) => {
    const next = new Map(queries.map((query) => [JSON.stringify(query), query]));
    for (const [key, unsubscribe] of watched) {
      if (next.has(key)) continue;
      unsubscribe();
      watched.delete(key);
    }
    for (const [key, query] of next) {
      if (watched.has(key)) continue;
      const live = db.db.createLiveQuery(query);
      live.getRows(); // the baseline it compares later results against
      watched.set(
        key,
        live.subscribe(() => refreshSoon()),
      );
    }
  };

  // Timers don't run while the app is suspended; the foreground refresh covers that case, and the
  // widgets' own day rollover (iOS timeline, Android periodic redraw) covers the time in between.
  const scheduleMidnight = () => {
    clearTimeout(midnight);
    const now = new Date();
    midnight = setTimeout(refresh, localMidnightMs(addLocalDays(now, 1)) - now.getTime() + 1_000);
  };

  const appState = AppState.addEventListener("change", (state) => {
    if (!ready) return;
    if (state === "background") refresh();
    else if (state === "active") refreshSoon(500);
  });

  void waitForInitialSync(db).then(() => {
    ready = true;
    refresh();
  });

  return () => {
    stopped = true;
    clearTimeout(debounce);
    clearTimeout(midnight);
    appState.remove();
    for (const unsubscribe of watched.values()) unsubscribe();
    watched.clear();
  };
}
