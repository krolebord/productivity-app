import {
  inlineTransactionRecord,
  type TransactionsSpec,
  TransactionsSpecSchema,
} from "@productivity/core/agent/transactions-spec";
import { useAccountLabels } from "@productivity/core/data/accounts";
import { useTransactionsByIds } from "@productivity/core/data/transactions";
import { getDisplayAmountForAccount } from "@productivity/core/transactions";
import { CircleAlert } from "lucide-react";
import { useTransactionDialogStore } from "@/components/transaction-dialog";
import { TransactionRow } from "@/components/transaction-row";
import { useDisplayCurrency } from "@/lib/finance/display-currency";

function TransactionsError() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      <CircleAlert className="size-3 text-destructive" />
      Could not render transactions
    </div>
  );
}

function MissingRow({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground text-xs">
      <CircleAlert className="size-3.5 shrink-0 text-destructive" />
      <span className="min-w-0 truncate">Transaction not found ({id})</span>
    </div>
  );
}

function TransactionsList({ spec }: { spec: TransactionsSpec }) {
  const openEdit = useTransactionDialogStore((state) => state.openEdit);
  const { baseCurrency, convert } = useDisplayCurrency();

  const refIds = spec.items.flatMap((item) => (item.kind === "ref" ? [item.id] : []));

  const transactions = useTransactionsByIds(refIds);
  const accounts = useAccountLabels();

  const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const hasInline = spec.items.some((item) => item.kind === "inline");

  function convertedAmount(display: { amount: number; currency: string }) {
    if (display.currency === baseCurrency) return undefined;
    const converted = convert(display.amount, display.currency);
    return converted === null ? undefined : { amount: converted, currency: baseCurrency };
  }

  return (
    <figure className="w-full overflow-hidden rounded-lg border bg-card">
      {(spec.title || spec.description) && (
        <figcaption className="border-b px-4 py-2.5">
          {spec.title && <div className="font-medium text-sm">{spec.title}</div>}
          {spec.description && <div className="text-muted-foreground text-xs">{spec.description}</div>}
        </figcaption>
      )}
      <div className="divide-y">
        {spec.items.map((item, index) => {
          if (item.kind === "ref") {
            const transaction = transactionsById.get(item.id);
            if (!transaction) {
              return <MissingRow key={`ref-${index}-${item.id}`} id={item.id} />;
            }
            const display = getDisplayAmountForAccount(transaction);
            return (
              <TransactionRow
                key={`ref-${index}-${item.id}`}
                variant="compact"
                transaction={transaction}
                primaryAccount={accountsById.get(transaction.accountId)}
                displayAmount={display}
                convertedAmount={convertedAmount(display)}
                onClick={() => openEdit(transaction.id)}
              />
            );
          }

          // Reuses the real row by shaping the inline item into a transaction record.
          const transaction = inlineTransactionRecord(item, Date.now());
          const display = getDisplayAmountForAccount(transaction);
          return (
            // Dashed left rule marks an agent-authored row that isn't in the ledger.
            <div key={`inline-${index}`} className="border-muted-foreground/40 border-l-2 border-dashed">
              <TransactionRow
                variant="compact"
                transaction={transaction}
                primaryAccount={item.accountLabel ? { labelText: item.accountLabel } : undefined}
                displayAmount={display}
                convertedAmount={convertedAmount(display)}
              />
            </div>
          );
        })}
      </div>
      {hasInline && (
        <p className="border-t px-4 py-1.5 text-muted-foreground text-xs">
          Dashed rows are examples, not saved transactions.
        </p>
      )}
    </figure>
  );
}

export default function TransactionsCard({ spec: rawSpec }: { spec: unknown }) {
  const parsed = TransactionsSpecSchema.safeParse(rawSpec);
  if (!parsed.success) {
    return <TransactionsError />;
  }
  return <TransactionsList spec={parsed.data} />;
}
