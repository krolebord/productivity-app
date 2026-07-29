/**
 * Per-run sync diagnostics, stored in Durable Object storage rather than the synced database.
 *
 * A sync that finds nothing still has something to record ("checked at 12:15", and the fresh
 * `syncToken`). Writing that into the synced DB would emit a CRDT event on every run — replicated to
 * every device and replayed by every new one — for information no other device needs. So it lives
 * here instead: local to the DO, one small blob per connection, and cheap to overwrite.
 *
 * Losing this storage is harmless: an empty `syncToken` just means the next run does a full window
 * resync, which is the same path a 410 from Google takes.
 */

const STORAGE_KEY_PREFIX = "calendar-sync-status:";

export type CalendarSourceSyncStatus = {
  /** Epoch ms of the last completed sync for this calendar, or null. */
  lastSyncedAt: number | null;
  /** Last sync error for this calendar, empty when healthy. */
  lastError: string;
  /** Google's incremental-sync cursor. Empty forces a full window resync. */
  syncToken: string;
};

export type CalendarConnectionSyncStatus = {
  lastSyncedAt: number | null;
  lastError: string;
  /** Keyed by Google calendar id. */
  calendars: Record<string, CalendarSourceSyncStatus>;
};

/** Shape returned to the client, flattened so the UI does not need to know about the storage keys. */
export type CalendarSyncStatusReport = {
  providerConnectionId: string;
  lastSyncedAt: number | null;
  lastError: string;
  calendars: { providerCalendarId: string; lastSyncedAt: number | null; lastError: string }[];
};

export const EMPTY_SOURCE_STATUS: CalendarSourceSyncStatus = {
  lastSyncedAt: null,
  lastError: "",
  syncToken: "",
};

function storageKey(providerConnectionId: string): string {
  return `${STORAGE_KEY_PREFIX}${providerConnectionId}`;
}

export async function readConnectionSyncStatus(
  storage: DurableObjectStorage,
  providerConnectionId: string,
): Promise<CalendarConnectionSyncStatus> {
  const stored = await storage.get<CalendarConnectionSyncStatus>(storageKey(providerConnectionId));
  return stored ?? { lastSyncedAt: null, lastError: "", calendars: {} };
}

export async function writeConnectionSyncStatus(
  storage: DurableObjectStorage,
  providerConnectionId: string,
  status: CalendarConnectionSyncStatus,
): Promise<void> {
  await storage.put(storageKey(providerConnectionId), status);
}

export async function deleteConnectionSyncStatus(
  storage: DurableObjectStorage,
  providerConnectionId: string,
): Promise<void> {
  await storage.delete(storageKey(providerConnectionId));
}

export function getSourceStatus(
  status: CalendarConnectionSyncStatus,
  providerCalendarId: string,
): CalendarSourceSyncStatus {
  return status.calendars[providerCalendarId] ?? EMPTY_SOURCE_STATUS;
}

/** Report for the integrations page: drops `syncToken`, which is server-only. */
export function toSyncStatusReport(
  providerConnectionId: string,
  status: CalendarConnectionSyncStatus,
): CalendarSyncStatusReport {
  return {
    providerConnectionId,
    lastSyncedAt: status.lastSyncedAt,
    lastError: status.lastError,
    calendars: Object.entries(status.calendars).map(([providerCalendarId, source]) => ({
      providerCalendarId,
      lastSyncedAt: source.lastSyncedAt,
      lastError: source.lastError,
    })),
  };
}
