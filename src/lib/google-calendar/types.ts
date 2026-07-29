import { z } from "zod";

export const GOOGLE_CALENDAR_PROVIDER_TYPE = "google-calendar" as const;

export const GOOGLE_CALENDAR_CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export type GoogleCalendarConnectionStatus = (typeof GOOGLE_CALENDAR_CONNECTION_STATUSES)[number];

/**
 * Read-only access to events on the user's calendars. `calendar.readonly` is a Google "sensitive"
 * scope: keep the Cloud project in testing mode with the account added as a test user, or the
 * consent screen needs verification.
 */
export const GOOGLE_CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"] as const;

export const SYNC_WINDOW_PAST_DAYS = 1;
export const SYNC_WINDOW_FUTURE_DAYS = 14;

/**
 * A Google Calendar event date: `dateTime` for timed events, `date` ("YYYY-MM-DD", in the
 * calendar's timezone) for all-day events. Exactly one is present.
 */
export const googleEventDateSchema = z.object({
  date: z.string().optional(),
  dateTime: z.string().optional(),
  timeZone: z.string().optional(),
});

export type GoogleEventDate = z.infer<typeof googleEventDateSchema>;

export const googleCalendarEventSchema = z.object({
  id: z.string(),
  status: z.string().default("confirmed"),
  summary: z.string().default(""),
  description: z.string().default(""),
  location: z.string().default(""),
  htmlLink: z.string().default(""),
  updated: z.string().optional(),
  start: googleEventDateSchema.optional(),
  end: googleEventDateSchema.optional(),
  recurringEventId: z.string().optional(),
});

export type GoogleCalendarEvent = z.infer<typeof googleCalendarEventSchema>;

export const googleEventsListResponseSchema = z.object({
  items: z.array(googleCalendarEventSchema).default([]),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});

export const googleCalendarListEntrySchema = z.object({
  id: z.string(),
  summary: z.string().default(""),
  summaryOverride: z.string().default(""),
  backgroundColor: z.string().default(""),
  primary: z.boolean().default(false),
  selected: z.boolean().default(false),
  accessRole: z.string().default(""),
  timeZone: z.string().default(""),
  deleted: z.boolean().default(false),
});

export type GoogleCalendarListEntry = z.infer<typeof googleCalendarListEntrySchema>;

export const googleCalendarListResponseSchema = z.object({
  items: z.array(googleCalendarListEntrySchema).default([]),
  nextPageToken: z.string().optional(),
});

/**
 * Stable `item.providerId` for a synced event.
 *
 * Scoped by connection and calendar: Google event ids are only unique within a calendar, so two
 * connected accounts holding the same invite would otherwise collapse into a single task.
 */
export function buildEventProviderId(args: {
  providerConnectionId: string;
  calendarId: string;
  eventId: string;
}): string {
  return `${args.providerConnectionId}:${args.calendarId}:${args.eventId}`;
}
