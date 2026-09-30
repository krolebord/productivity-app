import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, PlusIcon, RefreshCwIcon, Unplug } from "lucide-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { CalendarSyncStatusReport } from "@/lib/google-calendar/sync-status";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc/orpc-client";
import type { CalendarConnectionMetaItem, CalendarSourceItem } from "@/user-db/migrations";
import { useDbQuery } from "@/user-db/user-db";

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "connected":
      return { label: "Connected", className: "text-emerald-600 dark:text-emerald-400" };
    case "error":
      return { label: "Error", className: "text-rose-600 dark:text-rose-400" };
    default:
      return { label: "Disconnected", className: "text-muted-foreground" };
  }
}

/**
 * Sync diagnostics come from an RPC rather than the synced DB (they are per-run and per-device), so
 * `status` is undefined while the query is in flight or the app is offline. In that case the label is
 * omitted rather than guessed at.
 */
function lastSyncedLabel(status: SyncStatusEntry | undefined): string | null {
  if (!status) return null;
  if (status.lastSyncedAt == null) return "Not synced yet";
  return `Synced ${formatDistanceToNow(status.lastSyncedAt, { addSuffix: true })}`;
}

type SyncStatusEntry = { lastSyncedAt: number | null; lastError: string };

function useSyncStatusQuery(enabled: boolean) {
  return useQuery({
    ...orpc.integrations.googleCalendar.getSyncStatus.queryOptions(),
    enabled,
    // Diagnostics only — refresh while the page is open, but don't poll aggressively.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function CalendarSourceRow({
  source,
  connectionId,
  status,
  onChanged,
}: {
  source: CalendarSourceItem;
  connectionId: string;
  status: SyncStatusEntry | undefined;
  onChanged: () => void;
}) {
  const setCalendarEnabled = useMutation(
    orpc.integrations.googleCalendar.setCalendarEnabled.mutationOptions({
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update that calendar."),
    }),
  );

  function setEnabled(enabled: boolean) {
    setCalendarEnabled.mutate(
      {
        connectionId,
        sourceId: source.id,
        providerCalendarId: source.providerCalendarId,
        enabled,
      },
      { onSuccess: onChanged },
    );
  }

  const syncedLabel = source.enabled ? lastSyncedLabel(status) : "Not syncing";
  const detail = [source.isPrimary ? "Primary" : null, syncedLabel].filter((part) => part !== null).join(" · ");

  return (
    <label
      htmlFor={`calendar-enabled-${source.id}`}
      className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"
    >
      <Checkbox
        id={`calendar-enabled-${source.id}`}
        checked={source.enabled}
        onCheckedChange={(value) => setEnabled(value === true)}
        disabled={setCalendarEnabled.isPending}
      />
      {source.color ? (
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: source.color }} aria-hidden="true" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{source.displayName}</p>
        {detail ? <p className="truncate text-muted-foreground text-xs">{detail}</p> : null}
        {source.enabled && status?.lastError ? (
          <p className="mt-0.5 text-rose-600 text-xs dark:text-rose-400">{status.lastError}</p>
        ) : null}
      </div>
    </label>
  );
}

/**
 * One connected Google account, with a per-calendar checkbox deciding which calendars are mirrored
 * into tasks. Read-only and one-way — nothing is written back to Google.
 */
function GoogleCalendarAccountCard({
  connection,
  sources,
  syncStatus,
  reconnectPending,
  onReconnect,
  onSyncStatusStale,
}: {
  connection: CalendarConnectionMetaItem;
  sources: CalendarSourceItem[];
  syncStatus: CalendarSyncStatusReport | undefined;
  reconnectPending: boolean;
  onReconnect: () => void;
  onSyncStatusStale: () => void;
}) {
  const connectionId = connection.providerConnectionId;
  const needsReconnect = connection.status === "error";

  const refreshCalendars = useMutation(
    orpc.integrations.googleCalendar.refreshCalendars.mutationOptions({
      onSuccess: () => toast.success("Refreshed calendars."),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not refresh calendars."),
    }),
  );
  const syncNow = useMutation(
    orpc.integrations.googleCalendar.syncNow.mutationOptions({
      onSuccess: () => {
        toast.success("Syncing events…");
        onSyncStatusStale();
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not start a sync."),
    }),
  );
  const disconnect = useMutation(
    orpc.integrations.googleCalendar.disconnect.mutationOptions({
      onSuccess: () => toast.success("Google Calendar disconnected."),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not disconnect."),
    }),
  );

  const status = statusLabel(connection.status);
  const enabledCount = sources.filter((source) => source.enabled).length;
  const connectionSyncedLabel = lastSyncedLabel(syncStatus);
  const statusByCalendarId = useMemo(() => {
    const map = new Map<string, SyncStatusEntry>();
    for (const calendar of syncStatus?.calendars ?? []) {
      map.set(calendar.providerCalendarId, calendar);
    }
    return map;
  }, [syncStatus]);

  return (
    <div className="rounded-lg border">
      <div className="flex @2xl:flex-row flex-col @2xl:items-center @2xl:justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{connection.email || "Google account"}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className={cn("font-medium", status.className)}>{status.label}</span>
            {connectionSyncedLabel ? <span className="text-muted-foreground">{connectionSyncedLabel}</span> : null}
          </div>
          {syncStatus?.lastError ? (
            <p className="mt-1 text-rose-600 text-xs dark:text-rose-400">{syncStatus.lastError}</p>
          ) : needsReconnect ? (
            <p className="mt-1 text-rose-600 text-xs dark:text-rose-400">Reconnect this account to resume syncing.</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={needsReconnect ? "default" : "outline"}
            onClick={onReconnect}
            disabled={reconnectPending}
          >
            Reconnect
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refreshCalendars.mutate({ connectionId })}
            disabled={refreshCalendars.isPending}
          >
            <RefreshCwIcon className={refreshCalendars.isPending ? "animate-spin" : undefined} />
            Refresh calendars
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncNow.mutate({ connectionId })}
            disabled={syncNow.isPending}
          >
            Sync now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => disconnect.mutate({ connectionId })}
            disabled={disconnect.isPending}
          >
            <Unplug />
            Disconnect
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {sources.length === 0 ? (
          <p className="text-muted-foreground text-sm">No calendars yet. Use “Refresh calendars” to fetch them.</p>
        ) : (
          sources.map((source) => (
            <CalendarSourceRow
              key={source.id}
              source={source}
              connectionId={connectionId}
              status={statusByCalendarId.get(source.providerCalendarId)}
              onChanged={onSyncStatusStale}
            />
          ))
        )}
        {sources.length > 0 && enabledCount === 0 ? (
          <p className="text-muted-foreground text-xs">
            No calendars are enabled, so nothing is being mirrored from this account.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Google Calendar integration card: one sub-card per connected Google account. Several accounts can
 * be linked, and every action is scoped to the account whose card it belongs to.
 */
export function GoogleCalendarSection({
  connections,
  sourcesByConnection,
}: {
  connections: CalendarConnectionMetaItem[];
  sourcesByConnection: Map<string, CalendarSourceItem[]>;
}) {
  const queryClient = useQueryClient();
  const syncStatusQuery = useSyncStatusQuery(connections.length > 0);

  const invalidateSyncStatus = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: orpc.integrations.googleCalendar.getSyncStatus.key() });
  }, [queryClient]);

  const statusByConnectionId = useMemo(() => {
    const map = new Map<string, CalendarSyncStatusReport>();
    for (const report of syncStatusQuery.data?.connections ?? []) {
      map.set(report.providerConnectionId, report);
    }
    return map;
  }, [syncStatusQuery.data]);

  const connect = useMutation(
    orpc.integrations.googleCalendar.connect.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not start the Google flow."),
    }),
  );

  const errorCount = connections.filter((connection) => connection.status === "error").length;

  return (
    <Collapsible render={<section className="rounded-xl border bg-card" />}>
      <div className="flex @2xl:flex-row flex-col @2xl:items-center @2xl:justify-between gap-3 p-4">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform [[data-closed]_&]:-rotate-90" />
          <div className="min-w-0">
            <h2 className="font-semibold">Google Calendar</h2>
            <p
              className={cn(
                "mt-0.5 text-xs",
                errorCount > 0 ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground",
              )}
            >
              {connections.length === 0
                ? "Not connected"
                : errorCount > 0
                  ? `${errorCount} ${errorCount === 1 ? "account needs" : "accounts need"} reconnection`
                  : `${connections.length} ${connections.length === 1 ? "account" : "accounts"} connected`}
            </p>
          </div>
        </CollapsibleTrigger>

        <div className="flex flex-wrap gap-2 pl-6 @2xl:pl-0">
          <Button
            size="sm"
            variant={connections.length === 0 ? "default" : "outline"}
            onClick={() => connect.mutate({})}
            disabled={connect.isPending}
          >
            <PlusIcon />
            {connections.length === 0 ? "Connect" : "Connect another account"}
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t p-4">
          <p className="text-muted-foreground text-sm">
            Events from the calendars you pick appear as tasks in Today, refreshed every 15 minutes. Read-only:
            completing or editing a task here never changes anything in Google.
          </p>
          {connections.map((connection) => (
            <GoogleCalendarAccountCard
              key={connection.id}
              connection={connection}
              sources={sourcesByConnection.get(connection.providerConnectionId) ?? []}
              syncStatus={statusByConnectionId.get(connection.providerConnectionId)}
              reconnectPending={connect.isPending}
              onReconnect={() => connect.mutate({ loginHint: connection.email || undefined })}
              onSyncStatusStale={invalidateSyncStatus}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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
