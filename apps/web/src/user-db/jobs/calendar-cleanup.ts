import { CALENDAR_CLEANUP_PROVIDER_TYPE } from "@productivity/core/google-calendar/mapping";
import { GOOGLE_CALENDAR_PROVIDER_TYPE } from "@productivity/core/google-calendar/types";
import { z } from "zod";
import { defineJob } from "./jobs-base";

const cleanupInputSchema = z.object({
  providerConnectionId: z.string(),
  /** Limit cleanup to one calendar (when it is toggled off), or null for the whole connection. */
  providerCalendarId: z.string().nullable().default(null),
});

export type CalendarCleanupInput = z.infer<typeof cleanupInputSchema>;

/**
 * Removes mirrored tasks for a calendar or connection the user just switched off.
 *
 * Only upcoming, incomplete, still-attached tasks go: past and completed ones are history the user
 * may have acted on, and detached tasks are theirs now. Runs when a connection is disconnected or a
 * calendar is disabled, so turning a calendar off actually clears it out of the agenda.
 */
export const calendarCleanupJob = defineJob({ type: "calendar-cleanup" })
  .input(cleanupInputSchema)
  .handler(async ({ input, context }) => {
    const prefix = input.providerCalendarId
      ? `${input.providerConnectionId}:${input.providerCalendarId}:`
      : `${input.providerConnectionId}:`;
    const now = Date.now();

    const rows = context.syncDb.executeKysely((q) =>
      q
        .selectFrom("item")
        .select(["id", "providerId"])
        .where("providerType", "=", GOOGLE_CALENDAR_PROVIDER_TYPE)
        .where("completedAt", "is", null)
        .where("dueAt", ">=", now),
    ).rows;

    let removed = 0;
    for (const row of rows) {
      if (!row.providerId?.startsWith(prefix)) continue;
      context.syncDb.applyEvent({
        type: "item-updated",
        dataset: "_item",
        item_id: row.id,
        payload: { providerType: CALENDAR_CLEANUP_PROVIDER_TYPE },
      });
      context.syncDb.applyEvent({
        type: "item-deleted",
        dataset: "_item",
        item_id: row.id,
      });
      removed += 1;
    }

    console.log("[calendar-cleanup] removed upcoming mirrored tasks", {
      providerConnectionId: input.providerConnectionId,
      providerCalendarId: input.providerCalendarId,
      removed,
    });
  });
