import { formatForDisplay } from "@tanstack/hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, RefreshCwIcon, Wallet } from "lucide-react";
import { AccountCard } from "@/components/account-card";
import { useCreateAccount, useRefreshAccountBalances } from "@/components/account-dialog";
import { Button } from "@/components/ui/button";
import { NEW_ACCOUNT_HOTKEY } from "@/lib/hotkeys";
import { useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const createAccount = useCreateAccount();
  const refreshBalances = useRefreshAccountBalances();

  const { data: accounts } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"));

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-semibold text-xl">Accounts</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={refreshBalances} size="sm" variant="outline" disabled={accounts.length === 0}>
            <RefreshCwIcon />
            Refresh balances
          </Button>
          <Button onClick={createAccount} size="sm">
            <PlusIcon />
            New account
            <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
              {formatForDisplay(NEW_ACCOUNT_HOTKEY)}
            </kbd>
          </Button>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <Wallet className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No accounts yet</p>
            <p className="text-muted-foreground text-sm">Create one to start tracking your finances.</p>
          </div>
          <Button onClick={createAccount} variant="outline">
            <PlusIcon />
            New account
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </div>
  );
}
