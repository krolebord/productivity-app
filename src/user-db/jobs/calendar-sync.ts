import { generateId } from "@sqlite-sync/core";
import { z } from "zod";
import { db } from "@/lib/db";
import { fetchEvents, GoogleSyncTokenExpiredError } from "@/lib/google-calendar/api";
import {
  CALENDAR_CLEANUP_PROVIDER_TYPE,
  decideEventSync,
  type ExistingSyncedTask,
  syncWindow,
} from "@/lib/google-calendar/mapping";
import { describeApiError, getAccessTokenForConnection } from "@/lib/google-calendar/server";
import {
  getSourceStatus,
  readConnectionSyncStatus,
  writeConnectionSyncStatus,
} from "@/lib/google-calendar/sync-status";
import { buildEventProviderId, GOOGLE_CALENDAR_PROVIDER_TYPE } from "@/lib/google-calendar/types";
import { defineJob, type UserDbJobContext } from "./jobs-base";

const syncInputSchema = z.object({
  /** Sync a single connection, or every connected account when null (the interval run). */
  providerConnectionId: z.string().nullable().default(null),
});

export type CalendarSyncInput = z.infer<typeof syncInputSchema>;

/** Fallback zone for calendars Google reports without one. */
const DEFAULT_TIME_ZONE = "UTC";

type ProviderItemRow = {
  id: string;
  tombstone: number;
  providerId: string;
  providerType: string | null;
  providerUpdatedAt: number | null;
  completedAt: number | null;
  dueAt: number | null;
};

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Existing tasks for one calendar, keyed by `providerId`, **including tombstoned rows**.
 *
 * This is the one place that reads the base `_item` table instead of the CRDT view: the view hides
 * soft-deleted rows, and a task the user deleted must stay deleted rather than be recreated on the
 * next sync.
 */
function loadExistingTasks(
  ctx: DurableObjectState,
  providerConnectionId: string,
  calendarId: string,
): Map<string, ExistingSyncedTask> {
  const prefix = `${escapeLikePattern(`${providerConnectionId}:${calendarId}:`)}%`;

  const rows = ctx.storage.sql
    .exec<ProviderItemRow>(
      `select id, tombstone, providerId, providerType, providerUpdatedAt, completedAt, dueAt
       from _item
       where providerId like ? escape '\\'`,
      prefix,
    )
    .toArray();

  const byProviderId = new Map<string, ExistingSyncedTask>();
  for (const row of rows) {
    byProviderId.set(row.providerId, {
      id: row.id,
      tombstone: Boolean(row.tombstone),
      providerType: row.providerType,
      providerUpdatedAt: row.providerUpdatedAt,
      completedAt: row.completedAt,
      dueAt: row.dueAt,
    });
  }
  return byProviderId;
}

type SourceRow = {
  id: string;
  providerConnectionId: string;
  providerCalendarId: string;
  timeZone: string;
};

type SyncCounts = { created: number; updated: number; removed: number };

/**
 * Mirrors enabled Google calendars into tasks, one-way.
 *
 * Runs on an interval (and on demand after connecting or toggling a calendar). Each calendar is
 * synced incrementally via its stored `syncToken`; an expired token triggers one full re-fetch of
 * the window. Per-event reconciliation lives in `decideEventSync` so the rules that keep the mirror
 * from fighting the user are unit-tested.
 */
export const calendarSyncJob = defineJob({ type: "calendar-sync" })
  .input(syncInputSchema)
  .handler(async ({ input, context }) => {
    // Errored connections are included, not skipped: a transient Google failure must not park a
    // connection permanently, and `status` is what the next run flips back to "connected".
    const connections = context.syncDb.executeKysely((q) => {
      const query = q
        .selectFrom("calendar_connection")
        .select(["id", "providerConnectionId", "status"])
        .where("status", "!=", "disconnected");
      return input.providerConnectionId ? query.where("providerConnectionId", "=", input.providerConnectionId) : query;
    }).rows;

    for (const connection of connections) {
      const status = await readConnectionSyncStatus(context.ctx.storage, connection.providerConnectionId);

      const stored = await db
        .selectFrom("google_calendar_connection")
        .selectAll()
        .where("id", "=", connection.providerConnectionId)
        .executeTakeFirst();

      if (!stored || stored.status === "disconnected") {
        // The D1 row is the source of truth for whether the connection still exists.
        setSyncedStatus(context, connection, "disconnected");
        continue;
      }

      let accessToken: string;
      try {
        accessToken = await getAccessTokenForConnection(stored);
      } catch (error) {
        const message = describeApiError(error);
        console.error("[calendar-sync] connection failed", {
          providerConnectionId: connection.providerConnectionId,
          error: message,
        });

        setSyncedStatus(context, connection, "error");
        status.lastError = message;
        status.lastSyncedAt = Date.now();
        await writeConnectionSyncStatus(context.ctx.storage, connection.providerConnectionId, status);

        await db
          .updateTable("google_calendar_connection")
          .set({ status: "error", lastError: message, updatedAt: new Date().toISOString() })
          .where("id", "=", connection.providerConnectionId)
          .execute();
        continue;
      }

      // `enabled` is filtered in JS: a handful of calendars per account, and it avoids binding a
      // boolean parameter into SQLite.
      const sources = context.syncDb
        .executeKysely((q) =>
          q
            .selectFrom("calendar_source")
            .select(["id", "providerConnectionId", "providerCalendarId", "timeZone", "enabled"])
            .where("providerConnectionId", "=", connection.providerConnectionId),
        )
        .rows.filter((source) => source.enabled) as SourceRow[];

      let connectionError = "";

      for (const source of sources) {
        const sourceStatus = getSourceStatus(status, source.providerCalendarId);

        try {
          const result = await syncCalendarSource({
            context,
            accessToken,
            source,
            syncToken: sourceStatus.syncToken,
          });
          status.calendars[source.providerCalendarId] = {
            lastSyncedAt: Date.now(),
            lastError: "",
            syncToken: result.syncToken,
          };
          console.log("[calendar-sync] synced calendar", {
            calendarId: source.providerCalendarId,
            ...result.counts,
          });
        } catch (error) {
          const message = describeApiError(error);
          connectionError = message;
          console.error("[calendar-sync] calendar failed", {
            calendarId: source.providerCalendarId,
            error: message,
          });
          status.calendars[source.providerCalendarId] = {
            ...sourceStatus,
            lastSyncedAt: sourceStatus.lastSyncedAt,
            lastError: message,
          };
        }
      }

      status.lastSyncedAt = Date.now();
      status.lastError = connectionError;
      await writeConnectionSyncStatus(context.ctx.storage, connection.providerConnectionId, status);

      setSyncedStatus(context, connection, connectionError === "" ? "connected" : "error");

      // D1 keeps a coarse record for support/debugging; it is not read by the UI.
      await db
        .updateTable("google_calendar_connection")
        .set({
          status: connectionError === "" ? "connected" : "error",
          lastError: connectionError || null,
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where("id", "=", connection.providerConnectionId)
        .execute();
    }
  });

/**
 * Write the synced connection status **only when it actually changes**.
 *
 * This is the one field the UI reads from the replicated table, so a healthy account that syncs
 * every 15 minutes must not emit a CRDT event each time.
 */
function setSyncedStatus(
  context: UserDbJobContext,
  connection: { id: string; status: string },
  status: "connected" | "disconnected" | "error",
): void {
  if (connection.status === status) return;

  context.syncDb.enqueueEvent(
    context.syncDb.createEvent({
      type: "item-updated",
      dataset: "_calendar_connection",
      item_id: connection.id,
      payload: { status, updatedAt: Date.now() },
    }),
  );
}

async function syncCalendarSource(args: {
  context: UserDbJobContext;
  accessToken: string;
  source: SourceRow;
  syncToken: string;
}): Promise<{ counts: SyncCounts; syncToken: string }> {
  const { context, accessToken, source } = args;
  const timeZone = source.timeZone || DEFAULT_TIME_ZONE;
  const { startMs, endMs } = syncWindow(timeZone);

  let page: Awaited<ReturnType<typeof fetchEvents>>;
  let usedSyncToken = args.syncToken;

  try {
    page = await fetchEvents({
      accessToken,
      calendarId: source.providerCalendarId,
      syncToken: args.syncToken || undefined,
      timeMin: new Date(startMs),
      timeMax: new Date(endMs),
    });
  } catch (error) {
    if (!(error instanceof GoogleSyncTokenExpiredError)) throw error;

    // Google discarded the change history: fall back to a full window fetch.
    console.log("[calendar-sync] sync token expired, doing a full resync", {
      calendarId: source.providerCalendarId,
    });
    usedSyncToken = "";
    page = await fetchEvents({
      accessToken,
      calendarId: source.providerCalendarId,
      timeMin: new Date(startMs),
      timeMax: new Date(endMs),
    });
  }

  const existingByProviderId = loadExistingTasks(context.ctx, source.providerConnectionId, source.providerCalendarId);

  const counts: SyncCounts = { created: 0, updated: 0, removed: 0 };

  for (const event of page.events) {
    const providerId = buildEventProviderId({
      providerConnectionId: source.providerConnectionId,
      calendarId: source.providerCalendarId,
      eventId: event.id,
    });

    const decision = decideEventSync({
      event,
      existing: existingByProviderId.get(providerId),
      timeZone,
      windowStartMs: startMs,
      windowEndMs: endMs,
    });

    const now = Date.now();

    if (decision.action === "create") {
      const id = generateId();
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-created",
          dataset: "_item",
          item_id: id,
          payload: {
            id,
            type: "task",
            title: decision.fields.title,
            content: decision.fields.content,
            tags: "[]",
            dueAt: decision.fields.dueAt,
            hasDueTime: decision.fields.hasDueTime,
            completedAt: null,
            order: 0,
            createdAt: now,
            providerType: GOOGLE_CALENDAR_PROVIDER_TYPE,
            providerId,
            providerUpdatedAt: decision.fields.providerUpdatedAt,
          },
        }),
      );
      counts.created += 1;
      continue;
    }

    if (decision.action === "update") {
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-updated",
          dataset: "_item",
          item_id: decision.itemId,
          payload: {
            // `completedAt`, `order` and `tags` are intentionally absent: sync never overwrites
            // what the user did with the task, only what the event says about itself.
            title: decision.fields.title,
            content: decision.fields.content,
            dueAt: decision.fields.dueAt,
            hasDueTime: decision.fields.hasDueTime,
            providerUpdatedAt: decision.fields.providerUpdatedAt,
          },
        }),
      );
      counts.updated += 1;
      continue;
    }

    if (decision.action === "restore") {
      // sqlite-sync's runtime validator permits `tombstone: false` to resurrect a row, although the
      // generated update payload type conservatively omits the managed column.
      const restorePayload = {
        tombstone: false,
        providerType: GOOGLE_CALENDAR_PROVIDER_TYPE,
        title: decision.fields.title,
        content: decision.fields.content,
        dueAt: decision.fields.dueAt,
        hasDueTime: decision.fields.hasDueTime,
        providerUpdatedAt: decision.fields.providerUpdatedAt,
      };
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-updated",
          dataset: "_item",
          item_id: decision.itemId,
          payload: restorePayload,
        }),
      );
      counts.created += 1;
      continue;
    }

    if (decision.action === "remove") {
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-updated",
          dataset: "_item",
          item_id: decision.itemId,
          payload: { providerType: CALENDAR_CLEANUP_PROVIDER_TYPE },
        }),
      );
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-deleted",
          dataset: "_item",
          item_id: decision.itemId,
        }),
      );
      counts.removed += 1;
      continue;
    }

    if (decision.action === "tombstone") {
      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-deleted",
          dataset: "_item",
          item_id: decision.itemId,
        }),
      );
      counts.removed += 1;
    }
  }

  return {
    counts,
    // Only advance the cursor when Google gave us one; otherwise the next run resyncs fully.
    syncToken: page.nextSyncToken ?? usedSyncToken,
  };
}
