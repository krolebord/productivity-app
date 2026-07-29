import * as arctic from "arctic";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth-server";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { fetchCalendarList } from "@/lib/google-calendar/api";
import { getGoogleCalendarConnectionByGoogleUser } from "@/lib/google-calendar/connection-store";
import {
  describeApiError,
  getGoogleCalendarProvider,
  getUserDbStub,
  mapCalendarListToSources,
} from "@/lib/google-calendar/server";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/google-calendar/types";
import { calendarOAuthCookieSession } from "@/orpc/routers/google-calendar.router";
import type { ApiHandler } from "../api-handler";

const schema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().nullable().optional(),
});

function redirectToIntegrations(status: "connected" | "error", message?: string): Response {
  const env = getContext();
  const url = new URL(`${env.VITE_APP_URL}/integrations`);
  url.searchParams.set("calendar", status);
  if (message) {
    url.searchParams.set("calendarError", message);
  }
  return Response.redirect(url.toString(), 302);
}

/**
 * Completes the Google Calendar consent flow.
 *
 * Unlike the sign-in callback this runs for an already-authenticated user: the session cookie
 * identifies who the connection belongs to, and the separate `oauth-calendar` cookie carries the
 * PKCE state. Reconnecting the same Google account reuses its existing connection row, which keeps
 * `providerId`s (and therefore already-mirrored tasks) stable instead of duplicating them.
 */
export const googleCalendarCallbackHandler: ApiHandler = async ({ request, context }) => {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return Response.redirect(`${getContext().VITE_APP_URL}/sign-in`, 302);
  }

  const searchParams = new URL(request.url).searchParams;
  const data = schema.parse({
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    error: searchParams.get("error"),
  });

  const oauthData = await calendarOAuthCookieSession.get(context);
  await calendarOAuthCookieSession.clear(context);

  if (data.error) {
    return redirectToIntegrations("error", "Google Calendar access was not granted.");
  }

  if (!data.code || !data.state || !oauthData?.state || oauthData.state !== data.state) {
    return redirectToIntegrations("error", "The consent flow expired. Try connecting again.");
  }

  const google = getGoogleCalendarProvider();

  let tokens: arctic.OAuth2Tokens;
  try {
    tokens = await google.validateAuthorizationCode(data.code, oauthData.codeVerifier);
  } catch {
    return redirectToIntegrations("error", "Could not complete the Google authorization.");
  }

  let refreshToken: string;
  try {
    refreshToken = tokens.refreshToken();
  } catch {
    // Google omits the refresh token when the account already consented and `prompt=consent` was
    // dropped; without it background sync cannot work, so this is a hard failure.
    return redirectToIntegrations("error", "Google did not return a refresh token. Try connecting again.");
  }

  const idToken = tokens.idToken();
  const claims = idToken ? (arctic.decodeIdToken(idToken) as { sub?: string; email?: string }) : {};
  if (!claims.sub) {
    return redirectToIntegrations("error", "Google did not identify the account.");
  }

  // arctic throws rather than returning empty when Google omits `scope`; an unknown scope list is
  // not a reason to reject the connection, so it falls through to the sync job to find out.
  let scopes: string[] = [];
  try {
    scopes = tokens.scopes();
  } catch {
    scopes = [];
  }

  const calendarScope = GOOGLE_CALENDAR_SCOPES.find((scope) => scope.startsWith("https://"));
  if (calendarScope && scopes.length > 0 && !scopes.includes(calendarScope)) {
    return redirectToIntegrations("error", "Calendar access was not included in the grant.");
  }

  const now = new Date().toISOString();
  const existing = await getGoogleCalendarConnectionByGoogleUser(auth.userId, claims.sub);
  const connectionId = existing?.id ?? crypto.randomUUID();
  const accessToken = tokens.accessToken();
  const accessTokenExpiresAt = new Date(tokens.accessTokenExpiresAt()).toISOString();

  if (existing) {
    await db
      .updateTable("google_calendar_connection")
      .set({
        refreshToken,
        accessToken,
        accessTokenExpiresAt,
        email: claims.email ?? existing.email,
        scope: scopes.join(" "),
        status: "connected",
        lastError: null,
        disconnectedAt: null,
        updatedAt: now,
      })
      .where("id", "=", connectionId)
      .execute();
  } else {
    await db
      .insertInto("google_calendar_connection")
      .values({
        id: connectionId,
        userId: auth.userId,
        googleUserId: claims.sub,
        email: claims.email ?? "",
        refreshToken,
        accessToken,
        accessTokenExpiresAt,
        scope: scopes.join(" "),
        status: "connected",
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const stub = await getUserDbStub(auth.userId);

  try {
    const calendars = await fetchCalendarList(accessToken);
    await stub.enqueueCalendarMetadata({
      providerConnectionId: connectionId,
      connection: {
        status: "connected",
        email: claims.email ?? "",
        connectedAt: Date.now(),
      },
      sources: mapCalendarListToSources(calendars),
    });
    await stub.enqueueCalendarSync({ providerConnectionId: connectionId });
  } catch (error) {
    const message = describeApiError(error);
    await db
      .updateTable("google_calendar_connection")
      .set({ status: "error", lastError: message, updatedAt: now })
      .where("id", "=", connectionId)
      .execute();
    await stub.enqueueCalendarMetadata({
      providerConnectionId: connectionId,
      connection: { status: "error", email: claims.email ?? "", connectedAt: Date.now() },
    });
    return redirectToIntegrations("error", message);
  }

  return redirectToIntegrations("connected");
};
