import { generateId } from "@sqlite-sync/core";
import { z } from "zod";
import { defineJob } from "./jobs-base";

const sourceSchema = z.object({
  providerCalendarId: z.string(),
  displayName: z.string(),
  color: z.string(),
  isPrimary: z.boolean(),
  timeZone: z.string(),
  /** Only applied when the row is first created; later runs never re-enable a calendar. */
  enabledByDefault: z.boolean(),
});

const metadataInputSchema = z.object({
  providerConnectionId: z.string(),
  connection: z.object({
    status: z.string(),
    email: z.string(),
    connectedAt: z.number(),
  }),
  sources: z.array(sourceSchema).optional(),
});

export type CalendarMetadataInput = z.infer<typeof metadataInputSchema>;

/**
 * Upserts the synced display/status metadata for a Google Calendar connection and its calendars.
 *
 * Connection rows are keyed by `providerConnectionId`, source rows by
 * `(providerConnectionId, providerCalendarId)`. The user's `enabled` choice is never overwritten
 * here, and calendars missing from the input are left alone — a transient Google hiccup should not
 * silently stop a calendar from syncing. Sync diagnostics and cursors live in DO storage
 * (`src/lib/google-calendar/sync-status.ts`), not in these rows.
 */
export const calendarMetadataJob = defineJob({ type: "calendar-metadata" })
  .input(metadataInputSchema)
  .handler(async ({ input, context }) => {
    const now = Date.now();
    const { providerConnectionId, connection, sources } = input;

    const [existingConnection] = context.syncDb.executeKysely((q) =>
      q.selectFrom("calendar_connection").selectAll().where("providerConnectionId", "=", providerConnectionId),
    ).rows;

    if (existingConnection) {
      context.syncDb.applyEvent({
        type: "item-updated",
        dataset: "_calendar_connection",
        item_id: existingConnection.id,
        payload: {
          status: connection.status,
          // Empty input email means "leave as-is" (e.g. on disconnect, which has no account info).
          email: connection.email || existingConnection.email,
          connectedAt: existingConnection.connectedAt > 0 ? existingConnection.connectedAt : connection.connectedAt,
          updatedAt: now,
        },
      });
    } else {
      const id = generateId();
      context.syncDb.applyEvent({
        type: "item-created",
        dataset: "_calendar_connection",
        item_id: id,
        payload: {
          id,
          providerConnectionId,
          status: connection.status,
          email: connection.email,
          connectedAt: connection.connectedAt,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    if (!sources) {
      return;
    }

    for (const source of sources) {
      const [existingSource] = context.syncDb.executeKysely((q) =>
        q
          .selectFrom("calendar_source")
          .selectAll()
          .where("providerConnectionId", "=", providerConnectionId)
          .where("providerCalendarId", "=", source.providerCalendarId),
      ).rows;

      if (existingSource) {
        context.syncDb.applyEvent({
          type: "item-updated",
          dataset: "_calendar_source",
          item_id: existingSource.id,
          payload: {
            displayName: source.displayName,
            color: source.color,
            isPrimary: source.isPrimary,
            timeZone: source.timeZone,
            updatedAt: now,
          },
        });
        continue;
      }

      const id = generateId();
      context.syncDb.applyEvent({
        type: "item-created",
        dataset: "_calendar_source",
        item_id: id,
        payload: {
          id,
          providerConnectionId,
          providerCalendarId: source.providerCalendarId,
          displayName: source.displayName,
          color: source.color,
          isPrimary: source.isPrimary,
          timeZone: source.timeZone,
          enabled: source.enabledByDefault,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  });
