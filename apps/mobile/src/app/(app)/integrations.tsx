import { safe } from "@orpc/client";
import type { CalendarSyncStatusReport, McpToken } from "@productivity/core/api/contract";
import { useAccounts } from "@productivity/core/data/accounts";
import {
  useGoogleCalendarData,
  useMonobankAccounts,
  useMonobankConnection,
} from "@productivity/core/data/integrations";
import { linkMonobankAccount } from "@productivity/core/monobank/link";
import { useDb } from "@productivity/core/user-db/db-context";
import type {
  AccountItem,
  CalendarConnectionMetaItem,
  CalendarSourceItem,
  MonobankAccountItem,
} from "@productivity/core/user-db/migrations";
import { formatDistanceToNow } from "date-fns";
import { useFocusEffect, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/screen-header";
import { FormRow, FormSection } from "../../components/ui/form";
import { Icon, type IconName } from "../../components/ui/icon";
import { SelectField } from "../../components/ui/select-sheet";
import { api } from "../../lib/api";
import { API_URL } from "../../lib/config";
import { cn } from "../../lib/utils";

const ACCESS_LABEL: Record<McpToken["access"], string> = { read: "Read only", "read-write": "Read and write" };

const STATUS_STYLE = {
  connected: { label: "Connected", className: "text-emerald-600 dark:text-emerald-400" },
  error: { label: "Error", className: "text-rose-600 dark:text-rose-400" },
  disconnected: { label: "Disconnected", className: "text-muted-foreground" },
} as const;

function statusStyle(status: string) {
  return status === "connected" || status === "error" ? STATUS_STYLE[status] : STATUS_STYLE.disconnected;
}

function webhookStyle(status: string) {
  if (status === "active") return { label: "Webhook active", className: "text-emerald-600 dark:text-emerald-400" };
  if (status === "error") return { label: "Webhook error", className: "text-rose-600 dark:text-rose-400" };
  return { label: "Webhook pending", className: "text-amber-600 dark:text-amber-400" };
}

/**
 * Runs one server action at a time per card (taps during one are ignored, so actions can't
 * overlap or clear each other's spinner), reporting failures the way the web's toasts do.
 */
function useActions() {
  const [pending, setPending] = useState<string | null>(null);
  const inFlight = useRef(false);
  const run = useCallback(async (key: string, action: () => Promise<unknown>, onSuccess?: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(key);
    const { error } = await safe(action());
    inFlight.current = false;
    setPending(null);
    if (error) {
      Alert.alert("Something went wrong", error.message || "Try again.");
      return;
    }
    onSuccess?.();
  }, []);
  return { pending, run };
}

/** A server query refetched whenever the screen regains focus (e.g. after creating a token). */
function useFocusedQuery<T>(fetcher: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: enabled });
  const reload = useCallback(async () => {
    if (!enabled) return;
    setState((current) => ({ ...current, loading: true }));
    const { error, data } = await safe(fetcher());
    setState(error ? { error: error.message || "Couldn't load.", loading: false } : { data, loading: false });
  }, [fetcher, enabled]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { ...state, reload };
}

const listTokens = () => api.mcp.listTokens();
const getCalendarSyncStatus = () => api.integrations.googleCalendar.getSyncStatus();

export default function IntegrationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Integrations" onBack={router.back} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <MonobankSection />
        <GoogleCalendarSection />
        <McpSection />
      </ScrollView>
    </View>
  );
}

function MonobankSection() {
  const router = useRouter();
  const connection = useMonobankConnection();
  const monoAccounts = useMonobankAccounts();
  const accounts = useAccounts();
  const { pending, run } = useActions();

  const connected = connection !== undefined && connection.status !== "disconnected";
  const status = statusStyle(connected ? connection.status : "disconnected");
  const webhook = connection ? webhookStyle(connection.webhookStatus) : null;
  const linkedElsewhere = new Set(monoAccounts.map((account) => account.linkedAccountId).filter(Boolean));
  const openTokenSheet = (mode: "connect" | "replace") =>
    router.push({ pathname: "/monobank-token", params: { mode } });

  const confirmDisconnect = () =>
    Alert.alert("Disconnect Monobank?", "New transactions stop importing. Linked accounts keep their history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => void run("disconnect", () => api.integrations.monobank.disconnect()),
      },
    ]);

  return (
    <FormSection
      title="Monobank"
      footer={
        connected
          ? "Link each Monobank account to an app account to import its new transactions automatically."
          : "Connect your personal Monobank token to automatically import new transactions into linked accounts."
      }
    >
      <View className="gap-1 px-4 py-3">
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
          <Text className={cn("font-medium text-sm", status.className)}>{status.label}</Text>
          {connected && webhook && <Text className={cn("text-sm", webhook.className)}>{webhook.label}</Text>}
          {connected && connection.displayName ? (
            <Text className="text-muted-foreground text-sm">{connection.displayName}</Text>
          ) : null}
        </View>
        {connected && connection.lastError ? (
          <Text className="text-rose-600 text-sm dark:text-rose-400">{connection.lastError}</Text>
        ) : null}
      </View>
      <ActionRow>
        {connected ? (
          <>
            <SmallButton label="Replace token" icon="key" onPress={() => openTokenSheet("replace")} />
            <SmallButton
              label="Refresh accounts"
              icon="refresh-cw"
              loading={pending === "refresh"}
              onPress={() => void run("refresh", () => api.integrations.monobank.refreshAccounts())}
            />
            <SmallButton
              label="Disconnect"
              icon="link-2"
              loading={pending === "disconnect"}
              onPress={confirmDisconnect}
            />
          </>
        ) : (
          <SmallButton label="Connect" icon="plus" primary onPress={() => openTokenSheet("connect")} />
        )}
      </ActionRow>
      {connected &&
        (monoAccounts.length === 0 ? (
          <Text className="border-border border-t px-4 py-3 text-muted-foreground text-sm">
            No Monobank accounts yet. Use “Refresh accounts” to fetch them.
          </Text>
        ) : (
          <View className="border-border border-t">
            {monoAccounts.map((monoAccount, index) => (
              <MonobankAccountRow
                key={monoAccount.id}
                monoAccount={monoAccount}
                accounts={accounts}
                linkedElsewhere={linkedElsewhere}
                last={index === monoAccounts.length - 1}
              />
            ))}
          </View>
        ))}
    </FormSection>
  );
}

function MonobankAccountRow({
  monoAccount,
  accounts,
  linkedElsewhere,
  last,
}: {
  monoAccount: MonobankAccountItem;
  accounts: AccountItem[];
  linkedElsewhere: Set<string>;
  last: boolean;
}) {
  const db = useDb();
  const label = monoAccount.displayName || monoAccount.providerAccountId;

  if (!monoAccount.currency) {
    return (
      <FormRow label={label} last={last}>
        <Text className="text-muted-foreground text-sm">Unsupported currency</Text>
      </FormRow>
    );
  }

  const options = accounts
    .filter(
      (account) =>
        account.currency === monoAccount.currency &&
        (!linkedElsewhere.has(account.id) || account.id === monoAccount.linkedAccountId),
    )
    .map((account) => ({ value: account.id, label: account.labelText || account.description || "Untitled account" }));

  const link = (accountId: string) => {
    try {
      linkMonobankAccount(db.db, monoAccount.providerAccountId, accountId);
    } catch (error) {
      Alert.alert("Could not update the link", error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <SelectField
      label={`${label} · ${monoAccount.currency}`}
      value={monoAccount.linkedAccountId}
      options={options}
      onChange={link}
      placeholder="Not linked"
      clearLabel="Not linked"
      last={last}
    />
  );
}

function GoogleCalendarSection() {
  const { connections, sourcesByConnection } = useGoogleCalendarData();
  const syncStatus = useFocusedQuery(getCalendarSyncStatus, connections.length > 0);
  const statusById = new Map<string, CalendarSyncStatusReport>(
    (syncStatus.data?.connections ?? []).map((report) => [report.providerConnectionId, report]),
  );
  const watchSync = useSyncPolling(syncStatus.reload, statusById);

  return (
    <FormSection
      title="Google Calendar"
      footer="Events from the calendars you pick appear as tasks in Today, refreshed every 15 minutes. Read-only: nothing is written back to Google."
    >
      {connections.length === 0 ? (
        <Text className="border-border border-b px-4 py-3 text-muted-foreground text-sm">Not connected</Text>
      ) : (
        connections.map((connection) => (
          <CalendarAccount
            key={connection.id}
            connection={connection}
            sources={sourcesByConnection.get(connection.providerConnectionId) ?? []}
            report={statusById.get(connection.providerConnectionId)}
            onStale={() => watchSync(connection.providerConnectionId)}
          />
        ))
      )}
      {/* Google's consent flow is tied to the web session's cookies, so connecting happens there. */}
      <FormRow
        icon="external-link"
        label={connections.length === 0 ? "Connect on the web" : "Connect another account on the web"}
        onPress={() => void Linking.openURL(`${API_URL}/integrations`)}
        last
      />
    </FormSection>
  );
}

const SYNC_POLL_INTERVAL_MS = 3000;
const SYNC_POLL_TIMEOUT_MS = 30_000;

/**
 * "Sync now" only enqueues a job on the server, so after one the diagnostics are re-read every few
 * seconds, while the screen is focused, until the account's last-synced time moves or ~30s pass.
 */
function useSyncPolling(reload: () => Promise<void>, statusById: Map<string, CalendarSyncStatusReport>) {
  const [watch, setWatch] = useState<{ connectionId: string; baseline: number | null; until: number } | null>(null);
  const lastSyncedAt = watch ? statusById.get(watch.connectionId)?.lastSyncedAt : undefined;

  useEffect(() => {
    if (watch && lastSyncedAt !== undefined && lastSyncedAt !== watch.baseline) setWatch(null);
  }, [watch, lastSyncedAt]);

  useFocusEffect(
    useCallback(() => {
      if (!watch) return;
      const interval = setInterval(() => {
        if (Date.now() > watch.until) setWatch(null);
        else void reload();
      }, SYNC_POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [watch, reload]),
  );

  return (connectionId: string) => {
    setWatch({
      connectionId,
      baseline: statusById.get(connectionId)?.lastSyncedAt ?? null,
      until: Date.now() + SYNC_POLL_TIMEOUT_MS,
    });
    void reload();
  };
}

function syncedLabel(lastSyncedAt: number | null | undefined) {
  if (lastSyncedAt === undefined) return null;
  if (lastSyncedAt === null) return "Not synced yet";
  return `Synced ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}`;
}

function CalendarAccount({
  connection,
  sources,
  report,
  onStale,
}: {
  connection: CalendarConnectionMetaItem;
  sources: CalendarSourceItem[];
  report: CalendarSyncStatusReport | undefined;
  onStale: () => void;
}) {
  const { pending, run } = useActions();
  const connectionId = connection.providerConnectionId;
  const status = statusStyle(connection.status);
  const synced = syncedLabel(report?.lastSyncedAt);
  const calendarStatus = new Map((report?.calendars ?? []).map((calendar) => [calendar.providerCalendarId, calendar]));

  const confirmDisconnect = () =>
    Alert.alert(
      "Disconnect Google Calendar?",
      `Stops syncing ${connection.email || "this account"} and removes its mirrored tasks.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => void run("disconnect", () => api.integrations.googleCalendar.disconnect({ connectionId })),
        },
      ],
    );

  const setEnabled = (source: CalendarSourceItem, enabled: boolean) =>
    void run(
      `calendar-${source.id}`,
      () =>
        api.integrations.googleCalendar.setCalendarEnabled({
          connectionId,
          sourceId: source.id,
          providerCalendarId: source.providerCalendarId,
          enabled,
        }),
      onStale,
    );

  return (
    <View className="border-border border-b">
      <View className="gap-1 px-4 pt-3">
        <Text numberOfLines={1} className="font-medium text-base text-foreground">
          {connection.email || "Google account"}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-3">
          <Text className={cn("font-medium text-sm", status.className)}>{status.label}</Text>
          {synced && <Text className="text-muted-foreground text-sm">{synced}</Text>}
        </View>
        {report?.lastError ? (
          <Text className="text-rose-600 text-sm dark:text-rose-400">{report.lastError}</Text>
        ) : connection.status === "error" ? (
          <Text className="text-rose-600 text-sm dark:text-rose-400">
            Reconnect this account on the web to resume syncing.
          </Text>
        ) : null}
      </View>
      <ActionRow>
        <SmallButton
          label="Sync now"
          icon="refresh-cw"
          loading={pending === "sync"}
          onPress={() => void run("sync", () => api.integrations.googleCalendar.syncNow({ connectionId }), onStale)}
        />
        <SmallButton
          label="Refresh calendars"
          icon="list"
          loading={pending === "calendars"}
          onPress={() =>
            void run("calendars", () => api.integrations.googleCalendar.refreshCalendars({ connectionId }))
          }
        />
        <SmallButton label="Disconnect" icon="link-2" loading={pending === "disconnect"} onPress={confirmDisconnect} />
      </ActionRow>
      {sources.map((source) => {
        const sourceStatus = calendarStatus.get(source.providerCalendarId);
        const detail = [
          source.isPrimary ? "Primary" : null,
          source.enabled ? syncedLabel(sourceStatus?.lastSyncedAt) : "Not syncing",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <View key={source.id} className="min-h-12 flex-row items-center gap-3 border-border border-t px-4 py-2">
            {source.color ? <View className="size-2.5 rounded-full" style={{ backgroundColor: source.color }} /> : null}
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base text-foreground">
                {source.displayName}
              </Text>
              {detail ? <Text className="text-muted-foreground text-xs">{detail}</Text> : null}
              {source.enabled && sourceStatus?.lastError ? (
                <Text className="text-rose-600 text-xs dark:text-rose-400">{sourceStatus.lastError}</Text>
              ) : null}
            </View>
            <Switch
              accessibilityLabel={`Sync ${source.displayName}`}
              value={source.enabled}
              disabled={pending === `calendar-${source.id}`}
              onValueChange={(enabled) => setEnabled(source, enabled)}
              trackColorOnClassName="accent-primary"
            />
          </View>
        );
      })}
    </View>
  );
}

function McpSection() {
  const router = useRouter();
  const tokens = useFocusedQuery(listTokens);
  const { pending, run } = useActions();

  const confirmRevoke = (token: McpToken) =>
    Alert.alert(`Revoke “${token.name}”?`, "Agents using this token lose access immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: () => void run(token.id, () => api.mcp.revokeToken({ id: token.id }), tokens.reload),
      },
    ]);

  return (
    <FormSection title="MCP access" footer={`Connect external agents to ${API_URL}/mcp with a personal access token.`}>
      {tokens.loading && !tokens.data ? (
        <View className="items-center py-4">
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      ) : tokens.error && !tokens.data ? (
        <Pressable accessibilityRole="button" onPress={() => void tokens.reload()} className="px-4 py-3">
          <Text className="text-rose-600 text-sm dark:text-rose-400">{tokens.error} Tap to retry.</Text>
        </Pressable>
      ) : tokens.data?.length === 0 ? (
        <Text className="border-border border-b px-4 py-3 text-muted-foreground text-sm">No tokens yet.</Text>
      ) : (
        tokens.data?.map((token) => (
          <View key={token.id} className="flex-row items-center gap-3 border-border border-b py-2 pr-2 pl-4">
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base text-foreground">
                {token.name}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {ACCESS_LABEL[token.access]} · Created {formatDistanceToNow(token.createdAt, { addSuffix: true })} ·{" "}
                {token.lastUsedAt
                  ? `Last used ${formatDistanceToNow(token.lastUsedAt, { addSuffix: true })}`
                  : "Never used"}
              </Text>
            </View>
            {pending === token.id ? (
              <ActivityIndicator className="size-10" colorClassName="accent-muted-foreground" />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Revoke ${token.name}`}
                onPress={() => confirmRevoke(token)}
                hitSlop={4}
                className="size-10 items-center justify-center rounded-full active:bg-muted"
              >
                <Icon name="trash-2" size={18} colorClassName="accent-destructive" />
              </Pressable>
            )}
          </View>
        ))
      )}
      <FormRow icon="plus" label="New token" onPress={() => router.push("/mcp-token")} last />
    </FormSection>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2 px-4 pt-1 pb-3">{children}</View>;
}

function SmallButton({
  label,
  icon,
  onPress,
  loading = false,
  primary = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  loading?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      className={cn(
        "h-9 flex-row items-center gap-1.5 rounded-lg px-3 active:opacity-70 disabled:opacity-60",
        primary ? "bg-primary" : "border border-border bg-background",
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" colorClassName={primary ? "accent-primary-foreground" : "accent-foreground"} />
      ) : (
        <Icon name={icon} size={14} colorClassName={primary ? "accent-primary-foreground" : "accent-foreground"} />
      )}
      <Text className={cn("font-medium text-sm", primary ? "text-primary-foreground" : "text-foreground")}>
        {label}
      </Text>
    </Pressable>
  );
}
