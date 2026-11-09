import { deviceTimeZone } from "@productivity/core/time-zone";
import type { UserDbDatabase } from "@productivity/core/user-db/db-context";
import { buildWidgetSnapshots } from "@productivity/core/widgets/build";
import type { RecordedQuery } from "@productivity/core/widgets/reader";
import {
  createWidgetLinker,
  signedOutWidgetSnapshot,
  WIDGET_KINDS,
  type WidgetContext,
  type WidgetKind,
  type WidgetSnapshot,
  type WidgetSnapshotOf,
  widgetSnapshotHash,
} from "@productivity/core/widgets/snapshots";
import Constants from "expo-constants";
import { androidWidgetPublisher } from "./android-widgets";
import { iosWidgetPublisher } from "./ios-widgets";

/** This platform's publisher; null where there are no widgets. */
const publisher = iosWidgetPublisher ?? androidWidgetPublisher;

/** What each kind last published, by content hash, so unchanged kinds aren't redrawn. */
const published = new Map<WidgetKind, string>();
/** Publishes run one at a time, in order, so a later snapshot can't be overwritten by an earlier one. */
let queue: Promise<void> = Promise.resolve();

export function widgetContext(now = Date.now()): WidgetContext {
  // `productivity` in release builds, `productivity-dev` for the dev variant (app.config.ts).
  const scheme = typeof Constants.expoConfig?.scheme === "string" ? Constants.expoConfig.scheme : "productivity";
  // The device's zone, which the app's own Today and Finances screens use.
  return { now, timeZone: deviceTimeZone(), link: createWidgetLinker(scheme) };
}

function publishChanged(snapshots: readonly WidgetSnapshot[]) {
  if (!publisher) return;
  for (const snapshot of snapshots) {
    const kind = snapshot.kind;
    const hash = widgetSnapshotHash(snapshot);
    if (published.get(kind) === hash) continue;
    published.set(kind, hash);
    queue = queue.then(() =>
      publisher.publish(kind, snapshot as WidgetSnapshotOf<typeof kind>).catch((error: unknown) => {
        // Forget it, so the next refresh tries again.
        if (published.get(kind) === hash) published.delete(kind);
        console.warn(`Couldn't publish the ${kind} widget`, error);
      }),
    );
  }
}

/**
 * Rebuilds every widget's snapshot from the user DB and publishes the kinds whose content changed.
 * Returns the queries the snapshots were built from, for the caller to watch. Synchronous apart
 * from the publishing itself, so a future background job can await `widgetPublishesSettled()`.
 */
export function refreshWidgets(db: UserDbDatabase): RecordedQuery[] {
  if (!publisher) return [];
  const { snapshots, queries } = buildWidgetSnapshots(db, widgetContext());
  publishChanged(Object.values(snapshots));
  return queries;
}

/** Shows "Sign in" on every widget: after signing out, or on a launch without a session. */
export function publishSignedOutWidgets() {
  const ctx = widgetContext();
  publishChanged(WIDGET_KINDS.map((kind) => signedOutWidgetSnapshot(kind, ctx)));
}

/** Resolves once every publish queued so far has finished. */
export function widgetPublishesSettled() {
  return queue;
}
