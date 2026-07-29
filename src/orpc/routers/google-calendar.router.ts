import * as arctic from "arctic";
import { z } from "zod";
import { db } from "@/lib/db";
import { fetchCalendarList } from "@/lib/google-calendar/api";
import { getGoogleCalendarConnectionsByUserId } from "@/lib/google-calendar/connection-store";
import {
  describeApiError,
  getAccessTokenForConnection,
  getGoogleCalendarProvider,
  getUserDbStub,
  mapCalendarListToSources,
} from "@/lib/google-calendar/server";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/google-calendar/types";
import { createCookieSession } from "../common/auth";
import { protectedProcedure } from "../common/procedure";

type CalendarOAuthSessionData = {
  state: string;
  codeVerifier: string;
};

/**
 * Separate from the sign-in `oauth` cookie so a calendar consent flow can never be mistaken for a
 * sign-in callback (and vice versa).
 */
export const calendarOAuthCookieSession = createCookieSession<CalendarOAuthSessionData>({
  name: "oauth-calendar",
  maxAge: 60 * 10,
});

/**
 * Start the calendar consent flow.
 *
 * `access_type=offline` is what makes Google return a refresh token, and `prompt=consent` forces it
 * to be re-issued even if the account previously consented — without it a reconnect can come back
 * with no refresh token at all and the connection is unusable for background sync.
 */
const connect = protectedProcedure.handler(async ({ context }) => {
  const google = getGoogleCalendarProvider();
  const state = arctic.generateState();
  const codeVerifier = arctic.generateCodeVerifier();

  const url = google.createAuthorizationURL(state, codeVerifier, [...GOOGLE_CALENDAR_SCOPES]);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  await calendarOAuthCookieSession.set(context, { state, codeVerifier });

  return { url: url.toString() };
});

const connectionInput = z.object({ connectionId: z.string() });

/**
 * Resolve one of the user's connections by id.
 *
 * Every mutation below is scoped this way rather than picking the first connection: a user can have
 * several Google accounts linked, and acting on the wrong one is silent and confusing.
 */
async function requireConnection(userId: string, connectionId: string) {
  const connections = await getGoogleCalendarConnectionsByUserId(userId);
  return connections.find((candidate) => candidate.id === connectionId);
}

/**
 * Sync diagnostics for every connected account, read from Durable Object storage.
 *
 * Deliberately a query rather than synced data: "synced 3 minutes ago" changes on every run and is
 * of no interest to the user's other devices, so it must not become a replicated write.
 */
const getSyncStatus = protectedProcedure.handler(async ({ context }) => {
  const connections = await getGoogleCalendarConnectionsByUserId(context.auth.userId);
  if (connections.length === 0) {
    return { connections: [] };
  }

  const stub = await getUserDbStub(context.auth.userId);
  const reports = await stub.getCalendarSyncStatus(connections.map((connection) => connection.id));

  return { connections: reports };
});

/** Re-read the calendar list, picking up calendars added or renamed in Google since connecting. */
const refreshCalendars = protectedProcedure.input(connectionInput).handler(async ({ input, context, errors }) => {
  const connection = await requireConnection(context.auth.userId, input.connectionId);
  if (!connection) {
    throw errors.BAD_REQUEST({ message: "That Google account is no longer connected." });
  }

  try {
    const accessToken = await getAccessTokenForConnection(connection);
    const calendars = await fetchCalendarList(accessToken);

    const stub = await getUserDbStub(context.auth.userId);
    await stub.enqueueCalendarMetadata({
      providerConnectionId: connection.id,
      connection: {
        status: "connected",
        email: connection.email,
        connectedAt: new Date(connection.createdAt).getTime(),
      },
      sources: mapCalendarListToSources(calendars),
    });

    return { success: true as const };
  } catch (error) {
    throw errors.BAD_REQUEST({ message: describeApiError(error) });
  }
});

/**
 * Run a sync now instead of waiting for the 15-minute interval. Omitting `connectionId` syncs every
 * connected account, which is what the job's interval run does.
 */
const syncNow = protectedProcedure
  .input(z.object({ connectionId: z.string().nullable().default(null) }))
  .handler(async ({ input, context, errors }) => {
    const connections = await getGoogleCalendarConnectionsByUserId(context.auth.userId);
    if (connections.length === 0) {
      throw errors.BAD_REQUEST({ message: "Connect a Google account first." });
    }

    if (input.connectionId && !connections.some((candidate) => candidate.id === input.connectionId)) {
      throw errors.BAD_REQUEST({ message: "That Google account is no longer connected." });
    }

    const stub = await getUserDbStub(context.auth.userId);
    await stub.enqueueCalendarSync({ providerConnectionId: input.connectionId });

    return { success: true as const };
  });

/**
 * Clear the mirrored upcoming tasks for a calendar the user just switched off. The `enabled` flag
 * itself is written client-side straight to the synced DB.
 */
const cleanupCalendar = protectedProcedure
  .input(connectionInput.extend({ providerCalendarId: z.string().nullable().default(null) }))
  .handler(async ({ input, context, errors }) => {
    const connection = await requireConnection(context.auth.userId, input.connectionId);
    if (!connection) {
      throw errors.BAD_REQUEST({ message: "That Google account is no longer connected." });
    }

    const stub = await getUserDbStub(context.auth.userId);
    await stub.enqueueCalendarCleanup({
      providerConnectionId: connection.id,
      providerCalendarId: input.providerCalendarId,
    });

    return { success: true as const };
  });

/**
 * Disconnect the account: revoke the refresh token at Google, mark the D1 row disconnected, and
 * clear upcoming mirrored tasks. Past and completed tasks are left as history.
 */
const disconnect = protectedProcedure.input(connectionInput).handler(async ({ input, context }) => {
  const connection = await requireConnection(context.auth.userId, input.connectionId);

  if (!connection) {
    // Already gone — disconnecting twice is not an error.
    return { success: true as const };
  }

  // Best-effort revoke so the grant disappears from the user's Google account page too.
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: connection.refreshToken }),
    });
  } catch {
    // ignore — disconnect proceeds regardless
  }

  const now = new Date().toISOString();
  await db
    .updateTable("google_calendar_connection")
    .set({
      status: "disconnected",
      refreshToken: "",
      accessToken: null,
      accessTokenExpiresAt: null,
      lastError: null,
      disconnectedAt: now,
      updatedAt: now,
    })
    .where("id", "=", connection.id)
    .execute();

  const stub = await getUserDbStub(context.auth.userId);
  await stub.enqueueCalendarCleanup({ providerConnectionId: connection.id, providerCalendarId: null });
  await stub.enqueueCalendarMetadata({
    providerConnectionId: connection.id,
    connection: { status: "disconnected", email: "", connectedAt: 0 },
  });
  // Drop the stored cursors and diagnostics so a later reconnect starts from a clean full sync.
  await stub.clearCalendarSyncStatus(connection.id);

  return { success: true as const };
});

export const googleCalendarRouter = {
  connect,
  getSyncStatus,
  refreshCalendars,
  syncNow,
  cleanupCalendar,
  disconnect,
};
