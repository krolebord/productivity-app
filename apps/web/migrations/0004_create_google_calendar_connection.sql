-- Migration number: 0004 	 2026-07-29T00:00:00.000Z
-- Note: unlike "monobank_connection", "userId" is intentionally NOT unique — a user may connect
-- several Google accounts. The v1 UI only exposes one, but the schema does not need to change.
create table "google_calendar_connection" (
  "id" text primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "googleUserId" text not null,
  "email" text not null,
  "refreshToken" text not null,
  "accessToken" text,
  "accessTokenExpiresAt" text,
  "scope" text not null,
  "status" text not null default 'connected',
  "lastSyncedAt" text,
  "lastError" text,
  "createdAt" text not null,
  "updatedAt" text not null,
  "disconnectedAt" text
);

create unique index "google_calendar_connection_user_google_user"
  on "google_calendar_connection" ("userId", "googleUserId");
