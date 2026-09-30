import { Link } from "@tanstack/react-router";
import { SectionCard } from "@/components/page-shell";
import { useTransactionDialogStore } from "@/components/transaction-dialog";
import { TransactionRow } from "@/components/transaction-row";
import { buttonVariants } from "@/components/ui/button";
import type { AmountConverter } from "@/lib/finance/overview";
import { getDisplayAmountForAccount, type TransactionRow as TransactionRecord } from "@/lib/transactions";
import type { AccountItem } from "@/user-db/migrations";

export function RecentActivityCard({
  accounts,
  baseCurrency,
  convert,
  /** Carries the dashboard period into the transactions view. */
  rangeSearch,
  transactions,
}: {
  accounts: ReadonlyMap<string, AccountItem>;
  baseCurrency: string;
  convert: AmountConverter;
  rangeSearch: { from: number; to: number };
  transactions: readonly TransactionRecord[];
}) {
  const openEdit = useTransactionDialogStore((state) => state.openEdit);

  return (
    <SectionCard
      title="Recent activity"
      actions={
        <Link
          to="/finances/transactions"
          search={rangeSearch}
          className={buttonVariants({ size: "sm", variant: "ghost" })}
        >
          View all
        </Link>
      }
    >
      {transactions.length === 0 ? (
        <p className="px-4 py-10 text-center text-muted-foreground text-sm">No transactions yet.</p>
      ) : (
        <div className="divide-y">
          {transactions.map((transaction) => {
            const display = getDisplayAmountForAccount(transaction);
            const converted = display.currency === baseCurrency ? null : convert(display.amount, display.currency);

            return (
              <TransactionRow
                key={transaction.id}
                variant="compact"
                transaction={transaction}
                primaryAccount={accounts.get(transaction.accountId)}
                displayAmount={display}
                convertedAmount={converted === null ? undefined : { amount: converted, currency: baseCurrency }}
                onClick={() => openEdit(transaction.id)}
              />
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
