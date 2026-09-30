import { Link } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBalance } from "@/lib/currency/format";
import { cn } from "@/lib/utils";
import type { AccountItem } from "@/user-db/migrations";
import { useDb } from "@/user-db/user-db";

type AccountSummary = Pick<
  AccountItem,
  "id" | "balance" | "currency" | "excludeFromDashboard" | "labelColor" | "labelText"
>;

export function AccountDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

/** The dashboard include/exclude switch, shared by the account card and the overview list. */
export function AccountVisibilityToggle({
  account,
  className,
  iconClassName,
}: {
  account: Pick<AccountSummary, "id" | "excludeFromDashboard">;
  className?: string;
  iconClassName?: string;
}) {
  const db = useDb();
  const excluded = !!account.excludeFromDashboard;
  const label = excluded ? "Show on dashboard" : "Hide from dashboard";
  const Icon = excluded ? EyeIcon : EyeOffIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "shrink-0 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground",
              className,
            )}
            onClick={(event) => {
              event.stopPropagation();
              db.db.executeKysely((q) =>
                q.updateTable("account").set({ excludeFromDashboard: !excluded }).where("id", "=", account.id),
              );
            }}
          />
        }
      >
        <Icon className={cn("size-4", iconClassName)} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Compact "name + balance" account line used in list contexts. One link covers
 * the whole row so screen readers hear a single destination, with the
 * visibility toggle as a sibling rather than nested inside it.
 */
export function AccountBalanceRow({
  account,
  convertedBalance,
  /** Sits before the link, for chrome that must not be nested inside it (drag handle). */
  leading,
}: {
  account: AccountSummary;
  convertedBalance?: { amount: number; currency: string } | null;
  leading?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group flex items-center transition-colors hover:bg-muted/40",
        account.excludeFromDashboard && "opacity-50",
      )}
    >
      {leading}
      <Link
        to="/finances/transactions"
        search={{ accountId: account.id }}
        className={cn("flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2", leading ? "pl-1" : "pl-4")}
      >
        <AccountDot color={account.labelColor} />
        <span className="min-w-0 flex-1 truncate text-sm">{account.labelText || "Untitled"}</span>
        <span className="shrink-0 text-right">
          <span className="block font-medium font-mono text-sm tabular-nums">
            {formatBalance(Number(account.balance), account.currency)}
          </span>
          {convertedBalance ? (
            <span className="block font-mono text-muted-foreground text-xs tabular-nums">
              ≈ {formatBalance(convertedBalance.amount, convertedBalance.currency)}
            </span>
          ) : null}
        </span>
      </Link>
      <AccountVisibilityToggle
        account={account}
        className="mr-2 ml-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      />
    </div>
  );
}
