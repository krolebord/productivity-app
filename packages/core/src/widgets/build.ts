import { buildFinancesWidgetSnapshot, readFinancesWidgetInputs } from "./finances";
import { buildNotesWidgetSnapshot, readNotesWidgetInputs } from "./notes";
import { type RecordedQuery, recordWidgetQueries, type WidgetDbReader } from "./reader";
import type { WidgetContext, WidgetSnapshots } from "./snapshots";
import { buildTodayWidgetSnapshot, readTodayWidgetInputs } from "./today";

/**
 * Builds every widget kind's snapshot from the user DB, and returns the queries that were read
 * so the caller can watch them for changes. Cheap enough to run on every change: a handful of
 * small, indexed queries and a few KB of output.
 */
export function buildWidgetSnapshots(
  db: WidgetDbReader,
  ctx: WidgetContext,
): { snapshots: WidgetSnapshots; queries: RecordedQuery[] } {
  const { reader, queries } = recordWidgetQueries(db);
  const snapshots: WidgetSnapshots = {
    notes: buildNotesWidgetSnapshot(readNotesWidgetInputs(reader), ctx),
    today: buildTodayWidgetSnapshot(readTodayWidgetInputs(reader, ctx), ctx),
    finances: buildFinancesWidgetSnapshot(readFinancesWidgetInputs(reader, ctx), ctx),
  };
  return { snapshots, queries: [...queries.values()] };
}
