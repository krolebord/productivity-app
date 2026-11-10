import { AppState } from "react-native";
import { getApiSessionToken, setApiSessionToken } from "../lib/api";
import { readStoredSession } from "../lib/session";
import { withBackgroundUserDb } from "../lib/user-db";
import { refreshWidgets, widgetPublishesSettled } from "./refresh";

/** Android asks every placed widget to draw (and a resize asks many times); one run covers them. */
const MIN_INTERVAL_MS = 15 * 60_000;
/** Leaves room for opening the DB and publishing inside the 30 s an Android headless task gets. */
const CATCH_UP_TIMEOUT_MS = 15_000;

let running: Promise<void> | null = null;
let lastStartedAt = 0;

async function run() {
  const session = await readStoredSession();
  if (!session) return; // Signed out: the widgets already say "Sign in".
  if (!getApiSessionToken()) setApiSessionToken(session.token); // a headless start, the UI never set it
  await withBackgroundUserDb(session.user.userId, async (db) => {
    await db.state.catchUp({ timeoutMs: CATCH_UP_TIMEOUT_MS });
    // Whatever the sync got: offline, this still moves Today on to the current day.
    refreshWidgets(db.db);
    await widgetPublishesSettled();
    // catchUp reconnects; the screens' DB keeps no connection while the app is in the background.
    if (AppState.currentState !== "active") db.state.dropConnection();
  });
}

/**
 * Best-effort widget refresh without the UI: syncs the user DB and republishes the widgets whose
 * content changed. Does nothing in the foreground, where the open DB already syncs and publishes
 * on change (session.ts), or within 15 minutes of the last run. Never rejects.
 */
export function refreshWidgetsInBackground(): Promise<void> {
  if (running) return running;
  if (AppState.currentState === "active") return Promise.resolve();
  const now = Date.now();
  if (now - lastStartedAt < MIN_INTERVAL_MS) return Promise.resolve();
  lastStartedAt = now;
  running = run()
    .catch((error: unknown) => console.warn("Couldn't refresh the widgets in the background", error))
    .finally(() => {
      running = null;
    });
  return running;
}
