# Google Calendar integration

One-way, read-only mirror of Google Calendar events into tasks. Events from the calendars you enable
become ordinary `item` rows (`type: "task"`, `providerType: "google-calendar"`), so they show up in
the Today agenda with everything tasks already support — buckets, drag-to-reschedule, search, the
assistant. Nothing is ever written back to Google.

## Google Cloud setup

The integration reuses the existing OAuth client (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`), so
only two things need adding to it:

1. **Authorized redirect URI**: `<VITE_APP_URL>/api/auth/callback/google-calendar`
   (plus `http://localhost:3001/api/auth/callback/google-calendar` for local dev).
2. **Scope**: `https://www.googleapis.com/auth/calendar.readonly`.

`calendar.readonly` is a Google *sensitive* scope. Keep the Cloud project's consent screen in
**testing** mode with the account added as a test user — that avoids app verification. Note that
refresh tokens issued by an app in testing mode expire after 7 days, so the connection needs
re-authorising periodically; publishing the app (and going through verification) is what removes
that limit.

## How it works

| Piece | Location |
| --- | --- |
| Consent flow | `src/orpc/routers/google-calendar.router.ts`, `src/api/handlers/callback.google-calendar.ts` |
| Tokens (central D1) | `google_calendar_connection`, `migrations/0004_create_google_calendar_connection.sql` |
| Synced settings | `calendar_connection`, `calendar_source` in `src/user-db/migrations.ts` |
| Sync diagnostics + cursors | `src/lib/google-calendar/sync-status.ts` (Durable Object storage) |
| API client | `src/lib/google-calendar/api.ts` |
| Event → task mapping + rules | `src/lib/google-calendar/mapping.ts` (unit-tested) |
| Sync / cleanup jobs | `src/user-db/jobs/calendar-sync.ts`, `calendar-cleanup.ts`, `calendar-metadata.ts` |

- OAuth tokens live **only** in central D1, never in the synced per-user database.
- `calendar-sync` runs every 15 minutes in the user's Durable Object, plus on demand after
  connecting, toggling a calendar, or pressing “Sync now”.
- Each calendar syncs incrementally with Google's `syncToken`. A 410 (token too old) triggers one
  full re-fetch of the window.
- `singleEvents=true` expands recurring series, so each occurrence becomes its own task. The sync
  window is therefore deliberately narrow: `SYNC_WINDOW_PAST_DAYS`/`SYNC_WINDOW_FUTURE_DAYS` in
  `src/lib/google-calendar/types.ts` (currently 1 day back, 14 forward).
- All-day events are anchored to midnight in the *calendar's* timezone, not the worker's UTC
  midnight, so they land on the right day for users west of UTC.

## Where sync state lives

The split matters, because the synced database is a replicated CRDT event log: anything written
there is broadcast to every device and replayed by every new one.

| State | Home | Why |
| --- | --- | --- |
| `enabled`, calendar name/colour/timezone, `email`, connection `status` | synced DB | user intent and real state; other devices need it |
| `lastSyncedAt`, `lastError`, `syncToken` | DO storage (`calendar-sync-status:{connectionId}`) | changes on **every** run, including runs where nothing happened |
| refresh/access tokens | central D1 | secrets never belong in the synced DB |

A healthy sync therefore emits **zero** CRDT events. `status` is the one synced field the job writes,
and only when it actually transitions (`setSyncedStatus` no-ops otherwise). If you ever add a
"last checked" style field, put it in DO storage — a 15-minute interval writing to the synced DB
costs ~140k replicated events a year to say "nothing happened".

The integrations page reads diagnostics through the `getSyncStatus` RPC instead. Consequences worth
knowing: they aren't available offline (the row simply omits the timestamp), and they don't update
live — the query refetches on mount/focus, every 60s while open, and after Sync now / toggling a
calendar. Losing DO storage is harmless: an empty `syncToken` means the next run does a full window
resync, the same path a 410 takes.

## Reconciliation rules

Google is the source of truth, but the mirror must not fight the user. All of this is decided in
`decideEventSync` and covered by tests:

- A task the user **deleted** is never recreated — the lookup reads the base `_item` table so it can
  see tombstones.
- A task the user **detached** (`providerType: "detached"`, `providerId` kept) is left alone forever.
- `completedAt`, `order` and `tags` are **never** written by sync. Completing an event-backed task
  also protects it from being removed if the event is later cancelled.
- Otherwise Google wins on title, time and body — but only when the event's `updated` timestamp has
  advanced, so a full resync doesn't rewrite every row.
- Events outside the window are ignored rather than deleted: tasks that simply aged out are history.
- Disabling a calendar or disconnecting the account clears **upcoming, incomplete, still-attached**
  mirrored tasks only (`calendar-cleanup`).

## Known limitations

- Edits to a still-attached task's title or body are overwritten the next time the event changes.
  “Unlink” in the task dialog is the escape hatch.
- `item` has no end-time column, so duration, location and the event link live in the task body.

## Multiple Google accounts

Supported. “Connect another account” runs the consent flow again; each Google account gets its own
`google_calendar_connection` row (unique per `userId` + `googleUserId`, so reconnecting the same
account reuses its row and keeps already-mirrored tasks stable) and its own card of calendars.

Two things make this safe and are worth preserving:

- `providerId` is `{connectionId}:{calendarId}:{eventId}`. Google event ids are only unique per
  calendar, so without the connection prefix two accounts holding the same invite would collapse
  into one task.
- Every mutation (`refreshCalendars`, `syncNow`, `cleanupCalendar`, `disconnect`) takes an explicit
  `connectionId`. Don't reintroduce "pick the first connection" — it silently acts on the wrong
  account. The only unscoped path is `syncNow` with a null `connectionId`, which is the interval
  run's "sync every account" mode.
