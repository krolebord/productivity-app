import {
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
  googleCalendarListResponseSchema,
  googleEventsListResponseSchema,
} from "@productivity/core/google-calendar/types";
import { z } from "zod";

const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PAGE_SIZE = 250;

export class GoogleCalendarApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

/**
 * A 410 from `events.list` means the stored `syncToken` is too old and Google has discarded the
 * change history. The only recovery is dropping the token and doing a full window resync.
 */
export class GoogleSyncTokenExpiredError extends GoogleCalendarApiError {
  constructor() {
    super("Google Calendar sync token expired; a full resync is required.", 410);
    this.name = "GoogleSyncTokenExpiredError";
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().default(3600),
  scope: z.string().default(""),
});

export type RefreshedAccessToken = {
  accessToken: string;
  expiresAt: number;
  scope: string;
};

/**
 * Exchange a long-lived refresh token for a short-lived access token.
 *
 * A 400 `invalid_grant` here means the user revoked access (or the token was unused for six
 * months): the connection is dead and needs re-consent, so it surfaces with its status intact for
 * the caller to mark the connection as errored.
 */
export async function refreshAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<RefreshedAccessToken> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: args.clientId,
        client_secret: args.clientSecret,
        refresh_token: args.refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (error) {
    throw new GoogleCalendarApiError(error instanceof Error ? error.message : "Google token request failed.");
  }

  if (!response.ok) {
    throw new GoogleCalendarApiError(
      `Could not refresh the Google access token (${response.status} ${response.statusText}).`,
      response.status,
    );
  }

  const parsed = tokenResponseSchema.parse(await response.json());
  return {
    accessToken: parsed.access_token,
    // Expire a minute early so a token never dies mid-sync.
    expiresAt: Date.now() + (parsed.expires_in - 60) * 1000,
    scope: parsed.scope,
  };
}

export function isAccessTokenUsable(accessToken: string | null, expiresAt: string | null): boolean {
  if (!accessToken || !expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

async function googleRequest(accessToken: string, path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch (error) {
    throw new GoogleCalendarApiError(error instanceof Error ? error.message : "Google Calendar request failed.");
  }

  if (response.status === 410) {
    throw new GoogleSyncTokenExpiredError();
  }

  if (!response.ok) {
    let detail = "";
    try {
      const json = (await response.json()) as { error?: { message?: string } };
      detail = json?.error?.message ? `: ${json.error.message}` : "";
    } catch {}
    throw new GoogleCalendarApiError(
      `Google Calendar API request failed (${response.status} ${response.statusText})${detail}.`,
      response.status,
    );
  }

  return response.json();
}

export async function fetchCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const entries: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;

  do {
    const json = await googleRequest(accessToken, "/users/me/calendarList", {
      maxResults: String(PAGE_SIZE),
      showDeleted: "false",
      ...(pageToken ? { pageToken } : {}),
    });
    const page = googleCalendarListResponseSchema.parse(json);
    entries.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return entries;
}

export type EventsPage = {
  events: GoogleCalendarEvent[];
  nextSyncToken: string | undefined;
};

/**
 * Fetch events for one calendar, following pagination to the end.
 *
 * With `syncToken` this returns only what changed since the last sync (including cancellations,
 * hence `showDeleted`). Google forbids combining `syncToken` with `timeMin`/`timeMax`, so
 * incremental responses can include events outside the sync window — callers must apply their own
 * window filter. Without a token it performs a full `[timeMin, timeMax]` fetch instead.
 *
 * `singleEvents` expands recurring series into individual instances, which is what makes each
 * occurrence its own task.
 */
export async function fetchEvents(args: {
  accessToken: string;
  calendarId: string;
  syncToken?: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<EventsPage> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params: Record<string, string> = {
      maxResults: String(PAGE_SIZE),
      singleEvents: "true",
      showDeleted: "true",
      ...(pageToken ? { pageToken } : {}),
    };

    if (args.syncToken) {
      params.syncToken = args.syncToken;
    } else {
      params.timeMin = args.timeMin.toISOString();
      params.timeMax = args.timeMax.toISOString();
    }

    const json = await googleRequest(
      args.accessToken,
      `/calendars/${encodeURIComponent(args.calendarId)}/events`,
      params,
    );
    const page = googleEventsListResponseSchema.parse(json);
    events.push(...page.items);
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}
