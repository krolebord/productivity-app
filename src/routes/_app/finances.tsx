import { formatForDisplay } from "@tanstack/hotkeys";
import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { CoinsIcon, MoreHorizontalIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { useCreateAccount, useRefreshAccountBalances } from "@/components/account-dialog";
import { PageHeader, PageShell } from "@/components/page-shell";
import { TransactionQuickActions } from "@/components/transaction-quick-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRefreshRates } from "@/lib/currency/use-refresh-rates";
import { NEW_ACCOUNT_HOTKEY } from "@/lib/hotkeys";

export const Route = createFileRoute("/_app/finances")({
  component: FinancesWorkspace,
});

const SECTIONS = [
  { to: "/finances", label: "Overview", exact: true },
  { to: "/finances/transactions", label: "Transactions", exact: false },
  { to: "/finances/rates", label: "Rates", exact: false },
] as const;

/** The transactions tab filters by account; quick actions preselect that account. */
function useFilteredAccountId() {
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];

  return lastMatch?.fullPath === "/finances/transactions"
    ? (lastMatch.search as { accountId?: string }).accountId
    : undefined;
}

/** Workspace-level actions: they apply from every tab, so they live in the header. */
function FinanceActionsMenu() {
  const createAccount = useCreateAccount();
  const refreshBalances = useRefreshAccountBalances();
  const { refreshRates, isRefreshing } = useRefreshRates();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label="More actions">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={createAccount}>
          <WalletIcon className="size-4" />
          New account
          <DropdownMenuShortcut>{formatForDisplay(NEW_ACCOUNT_HOTKEY)}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={refreshBalances}>
          <RefreshCwIcon className="size-4" />
          Refresh balances
        </DropdownMenuItem>
        <DropdownMenuItem onClick={refreshRates} disabled={isRefreshing}>
          <CoinsIcon className="size-4" />
          Refresh rates
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FinancesWorkspace() {
  const accountId = useFilteredAccountId();

  return (
    <PageShell>
      <PageHeader
        title="Finances"
        description="See the whole picture, then inspect every movement."
        actions={
          <>
            <TransactionQuickActions accountId={accountId} className="flex-1 sm:flex-none" />
            <FinanceActionsMenu />
          </>
        }
      >
        <div className="border-b">
          {/* Only the nav gets the -1px pull: a negative margin on the tabs too would
              push their border past the scroll container and add a vertical scrollbar,
              since overflow-x also makes overflow-y scrollable. */}
          <nav aria-label="Finances sections" className="-mb-px flex gap-5 overflow-x-auto">
            {SECTIONS.map((section) => (
              <Link
                key={section.to}
                to={section.to}
                activeOptions={{ exact: section.exact }}
                className="shrink-0 border-transparent border-b-2 px-0.5 pb-2.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground data-[status=active]:border-foreground data-[status=active]:text-foreground"
              >
                {section.label}
              </Link>
            ))}
          </nav>
        </div>
      </PageHeader>

      <div className="pt-6">
        <Outlet />
      </div>
    </PageShell>
  );
}
