import type { GoogleCalendarListEntry } from "@productivity/core/google-calendar/types";
import * as arctic from "arctic";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import type { CalendarMetadataInput } from "@/user-db/jobs/calendar-metadata";
import { type GoogleCalendarApiError, isAccessTokenUsable, refreshAccessToken } from "./api";

export { getUserDbStub } from "@/lib/user-db-stub";

export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/auth/callback/google-calendar";

/**
 * Provider for the calendar consent flow. Deliberately separate from the sign-in provider: it has
 * its own redirect URI so the sign-in callback keeps its minimal scopes and existing sessions are
 * never asked to re-consent.
 */
export function getGoogleCalendarProvider() {
  const context = getContext();
  return new arctic.Google(
    context.GOOGLE_CLIENT_ID,
    context.GOOGLE_CLIENT_SECRET,
    `${context.VITE_APP_URL}${GOOGLE_CALENDAR_CALLBACK_PATH}`,
  );
}

/**
 * A usable access token for a connection, refreshing and persisting it when the stored one has
 * expired. Access tokens are cached in D1 so a burst of syncs does not re-mint one every run.
 */
export async function getAccessTokenForConnection(connection: {
  id: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
}): Promise<string> {
  if (isAccessTokenUsable(connection.accessToken, connection.accessTokenExpiresAt) && connection.accessToken) {
    return connection.accessToken;
  }

  const context = getContext();
  const refreshed = await refreshAccessToken({
    clientId: context.GOOGLE_CLIENT_ID,
    clientSecret: context.GOOGLE_CLIENT_SECRET,
    refreshToken: connection.refreshToken,
  });

  await db
    .updateTable("google_calendar_connection")
    .set({
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: new Date(refreshed.expiresAt).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where("id", "=", connection.id)
    .execute();

  return refreshed.accessToken;
}

/** Record a connection-level failure so the integrations page can explain itself. */
export async function markConnectionError(connectionId: string, error: unknown): Promise<string> {
  const message = describeApiError(error);
  const now = new Date().toISOString();

  await db
    .updateTable("google_calendar_connection")
    .set({ status: "error", lastError: message, updatedAt: now })
    .where("id", "=", connectionId)
    .execute();

  return message;
}

/**
 * User-facing message for a Google failure. A 400 from the token endpoint means the refresh token
 * no longer works — revoked access, or six months unused — which needs re-consent, not a retry.
 */
export function describeApiError(error: unknown): string {
  const status = (error as GoogleCalendarApiError | undefined)?.status;

  if (status === 400 || status === 401) {
    return "Google revoked access to this account. Reconnect it to resume syncing.";
  }
  if (status === 403) {
    return "Google denied the request. Check that Calendar access is still granted.";
  }
  if (status === 429 || (typeof status === "number" && status >= 500)) {
    return "Google Calendar is temporarily unavailable. The next sync will retry.";
  }
  return error instanceof Error ? error.message : "Could not reach Google Calendar.";
}

/**
 * Map Google's calendar list into sync metadata. Only the primary calendar is enabled by default —
 * enabling everything would drop holidays and shared team calendars straight into the task list.
 */
export function mapCalendarListToSources(
  entries: GoogleCalendarListEntry[],
): NonNullable<CalendarMetadataInput["sources"]> {
  return entries
    .filter((entry) => !entry.deleted)
    .map((entry) => ({
      providerCalendarId: entry.id,
      displayName: entry.summaryOverride || entry.summary || entry.id,
      color: entry.backgroundColor,
      isPrimary: entry.primary,
      timeZone: entry.timeZone,
      enabledByDefault: entry.primary,
    }));
}
