import { useMemo } from "react";
import { useDbQuery } from "../user-db/db-context";
import type { CalendarSourceItem } from "../user-db/migrations";

export function useMonobankConnection() {
  const { data } = useDbQuery((q) => q.selectFrom("monobank_connection").selectAll().limit(1));
  return data[0];
}

export function useMonobankAccounts() {
  const { data } = useDbQuery((q) => q.selectFrom("monobank_account").selectAll().orderBy("createdAt", "asc"));
  return data;
}

/** Query the synced tables the card renders from, grouping calendars by the account they belong to. */
export function useGoogleCalendarData() {
  const { data: connections } = useDbQuery((q) =>
    q.selectFrom("calendar_connection").selectAll().orderBy("createdAt", "asc"),
  );
  const { data: sources } = useDbQuery((q) => q.selectFrom("calendar_source").selectAll().orderBy("createdAt", "asc"));

  const activeConnections = useMemo(
    () => connections.filter((connection) => connection.status !== "disconnected"),
    [connections],
  );

  const sourcesByConnection = useMemo(() => {
    const map = new Map<string, CalendarSourceItem[]>();
    for (const source of sources) {
      const existing = map.get(source.providerConnectionId);
      if (existing) {
        existing.push(source);
      } else {
        map.set(source.providerConnectionId, [source]);
      }
    }
    return map;
  }, [sources]);

  return { connections: activeConnections, sourcesByConnection };
}

/**
 * True when a connected integration is in an error state the user can fix on the integrations page.
 * Uses the synced connection rows so the badge works offline and updates live.
 */
export function useIntegrationsHasError() {
  const { data: calendarConnections } = useDbQuery((q) =>
    q.selectFrom("calendar_connection").select(["id", "status"]).where("status", "=", "error"),
  );
  const { data: monobankConnections } = useDbQuery((q) =>
    q.selectFrom("monobank_connection").select(["id", "status", "webhookStatus"]),
  );

  return (
    calendarConnections.length > 0 ||
    monobankConnections.some(
      (connection) =>
        connection.status !== "disconnected" && (connection.status === "error" || connection.webhookStatus === "error"),
    )
  );
}
