import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon, RefreshCwIcon, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useCreateAccount } from "@/components/account-dialog";
import { GoogleCalendarSection, useGoogleCalendarData } from "@/components/google-calendar-section";
import { MonobankBackfillDialog } from "@/components/monobank-backfill-dialog";
import { MonobankTokenDialog } from "@/components/monobank-token-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { linkMonobankAccount } from "@/lib/monobank/link";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc/orpc-client";
import type { AccountItem, MonobankAccountItem, MonobankConnectionMetaItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsPage,
  validateSearch: z.object({
    calendar: z.enum(["connected", "error"]).optional(),
    calendarError: z.string().optional(),
  }),
});

const UNLINK_VALUE = "__unlink__";
const NEW_ACCOUNT_VALUE = "__new__";

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

function webhookLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Webhook active", className: "text-emerald-600 dark:text-emerald-400" };
    case "error":
      return { label: "Webhook error", className: "text-rose-600 dark:text-rose-400" };
    default:
      return { label: "Webhook pending", className: "text-amber-600 dark:text-amber-400" };
  }
}

function MonobankAccountRow({
  monoAccount,
  accounts,
  linkedElsewhere,
}: {
  monoAccount: MonobankAccountItem;
  accounts: AccountItem[];
  linkedElsewhere: Set<string>;
}) {
  const db = useDb();
  const createAccount = useCreateAccount();
  const [backfillOpen, setBackfillOpen] = useState(false);

  const options = accounts.filter(
    (account) =>
      account.currency === monoAccount.currency &&
      (!linkedElsewhere.has(account.id) || account.id === monoAccount.linkedAccountId),
  );

  function handleChange(value: string) {
    if (value === NEW_ACCOUNT_VALUE) {
      createAccount();
      return;
    }

    try {
      linkMonobankAccount(db.db, monoAccount.providerAccountId, value === UNLINK_VALUE ? "" : value);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the link.");
    }
  }

  const unsupported = monoAccount.currency === "";

  return (
    <div className="flex @xl:flex-row flex-col @xl:items-center @xl:justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{monoAccount.displayName || monoAccount.providerAccountId}</p>
        <p className="text-muted-foreground text-xs">
          {monoAccount.currency || "Unsupported currency"}
          {monoAccount.accountType ? ` · ${monoAccount.accountType}` : ""}
        </p>
        {monoAccount.lastError ? (
          <p className="text-rose-600 text-xs dark:text-rose-400">{monoAccount.lastError}</p>
        ) : null}
      </div>

      {unsupported ? (
        <span className="text-muted-foreground text-xs">Cannot be linked</span>
      ) : (
        <div className="flex items-center gap-2">
          <Select value={monoAccount.linkedAccountId || UNLINK_VALUE} onValueChange={handleChange}>
            <SelectTrigger className="@xl:w-56 w-full">
              <SelectValue placeholder="Not linked" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNLINK_VALUE}>Not linked</SelectItem>
              {options.length > 0 ? <SelectSeparator /> : null}
              {options.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.labelText || account.description || "Untitled account"}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={NEW_ACCOUNT_VALUE}>
                <PlusIcon className="size-3.5" />
                New account
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Import recent transactions"
            title={monoAccount.linkedAccountId ? "Import recent transactions" : "Link an account first"}
            disabled={!monoAccount.linkedAccountId}
            onClick={() => setBackfillOpen(true)}
          >
            <DownloadIcon />
          </Button>
        </div>
      )}

      {monoAccount.linkedAccountId ? (
        <MonobankBackfillDialog
          open={backfillOpen}
          onOpenChange={setBackfillOpen}
          providerAccountId={monoAccount.providerAccountId}
          currency={monoAccount.currency}
        />
      ) : null}
    </div>
  );
}

function MonobankSection({
  connection,
  monoAccounts,
  accounts,
}: {
  connection: MonobankConnectionMetaItem | undefined;
  monoAccounts: MonobankAccountItem[];
  accounts: AccountItem[];
}) {
  const [dialog, setDialog] = useState<{ open: boolean; mode: "connect" | "replace" }>({
    open: false,
    mode: "connect",
  });

  const refreshAccounts = useMutation(
    orpc.integrations.monobank.refreshAccounts.mutationOptions({
      onSuccess: () => toast.success("Refreshed Monobank accounts."),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not refresh accounts."),
    }),
  );
  const disconnect = useMutation(
    orpc.integrations.monobank.disconnect.mutationOptions({
      onSuccess: () => toast.success("Monobank disconnected."),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not disconnect."),
    }),
  );

  const isConnected = connection !== undefined && connection.status !== "disconnected";

  const linkedElsewhere = new Set<string>();
  for (const account of monoAccounts) {
    if (account.linkedAccountId) {
      linkedElsewhere.add(account.linkedAccountId);
    }
  }

  const status = statusLabel(isConnected ? connection.status : "disconnected");
  const webhook = connection ? webhookLabel(connection.webhookStatus) : null;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex @2xl:flex-row flex-col @2xl:items-center @2xl:justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Monobank</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className={cn("font-medium", status.className)}>{status.label}</span>
            {isConnected && webhook ? <span className={webhook.className}>{webhook.label}</span> : null}
            {connection?.displayName ? <span className="text-muted-foreground">{connection.displayName}</span> : null}
          </div>
          {isConnected && connection.lastError ? (
            <p className="mt-1 text-rose-600 text-xs dark:text-rose-400">{connection.lastError}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, mode: "replace" })}>
                Replace token
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refreshAccounts.mutate({})}
                disabled={refreshAccounts.isPending}
              >
                <RefreshCwIcon className={refreshAccounts.isPending ? "animate-spin" : undefined} />
                Refresh accounts
              </Button>
              <Button size="sm" variant="outline" onClick={() => disconnect.mutate({})} disabled={disconnect.isPending}>
                <Unplug />
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setDialog({ open: true, mode: "connect" })}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {isConnected ? (
        <div className="flex flex-col gap-2 p-4">
          {monoAccounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No Monobank accounts yet. Use “Refresh accounts” to fetch them.
            </p>
          ) : (
            monoAccounts.map((monoAccount) => (
              <MonobankAccountRow
                key={monoAccount.id}
                monoAccount={monoAccount}
                accounts={accounts}
                linkedElsewhere={linkedElsewhere}
              />
            ))
          )}
        </div>
      ) : (
        <div className="p-4">
          <p className="text-muted-foreground text-sm">
            Connect your personal Monobank token to automatically import new transactions into linked accounts.
          </p>
        </div>
      )}

      <MonobankTokenDialog
        open={dialog.open}
        mode={dialog.mode}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
      />
    </section>
  );
}

function IntegrationsPage() {
  const { data: connections } = useDbQuery((q) => q.selectFrom("monobank_connection").selectAll().limit(1));
  const { data: monoAccounts } = useDbQuery((q) =>
    q.selectFrom("monobank_account").selectAll().orderBy("createdAt", "asc"),
  );
  const { data: accounts } = useDbQuery((q) => q.selectFrom("account").selectAll().orderBy("order", "asc"));
  const calendar = useGoogleCalendarData();

  useCalendarConnectResult();

  return (
    <div className="@container flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="@md:mb-2 font-semibold text-xl">Integrations</h1>
      <MonobankSection connection={connections[0]} monoAccounts={monoAccounts} accounts={accounts} />
      <GoogleCalendarSection connections={calendar.connections} sourcesByConnection={calendar.sourcesByConnection} />
    </div>
  );
}

/** Surface the outcome of the Google consent redirect, then drop it from the URL. */
function useCalendarConnectResult() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!search.calendar) return;

    if (search.calendar === "connected") {
      toast.success("Google Calendar connected.");
    } else {
      toast.error(search.calendarError || "Could not connect Google Calendar.");
    }

    navigate({ to: "/integrations", replace: true, search: {} });
  }, [search.calendar, search.calendarError, navigate]);
}
