import { formatBalance } from "@productivity/core/currency/format";
import { formatDateTimeDisplay } from "@productivity/core/date-time";
import type { AccountRow, TransactionRow as TransactionRecord } from "@productivity/core/transactions";
import type { MouseEventHandler } from "react";
import { IMPORTANCE_STYLE, resolveTransactionType, TRANSACTION_TYPE_STYLE, transactionTitle } from "@/lib/finance-ui";
import { cn } from "@/lib/utils";

type DisplayAmount = {
  amount: number;
  currency: string;
};

type AccountSummary = Pick<AccountRow, "labelText">;

type TransactionRowProps = {
  transaction: TransactionRecord;
  primaryAccount?: AccountSummary;
  secondaryAccount?: AccountSummary;
  displayAmount: DisplayAmount;
  /** Same amount in the dashboard's base currency, shown under the primary one. */
  convertedAmount?: DisplayAmount;
  /** Omit to render a non-interactive row instead of a button. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  isAttachMode?: boolean;
} & (
  | {
      variant: "compact";
    }
  | {
      variant: "detailed";
      showTransferPair?: boolean;
    }
);

function ConvertedAmount({ amount, className }: { amount?: DisplayAmount; className?: string }) {
  if (!amount) {
    return null;
  }

  return (
    <span className={cn("block whitespace-nowrap font-mono text-muted-foreground tabular-nums", className)}>
      ≈ {formatBalance(amount.amount, amount.currency)}
    </span>
  );
}

function AmountValue({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  return (
    <span className={cn("block whitespace-nowrap font-medium font-mono tabular-nums", className)}>
      {formatBalance(amount, currency)}
    </span>
  );
}

function CompactTransactionRow({
  transaction,
  primaryAccount,
  displayAmount,
  convertedAmount,
}: Omit<Extract<TransactionRowProps, { variant: "compact" }>, "onClick" | "variant">) {
  const typeStyle = TRANSACTION_TYPE_STYLE[resolveTransactionType(transaction.type)];
  const Icon = typeStyle.icon;
  const subtitle = [
    transaction.category,
    primaryAccount?.labelText || "Untitled",
    formatDateTimeDisplay(transaction.effectiveAt),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <>
      <span className={cn("shrink-0", typeStyle.accent)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">{transactionTitle(transaction)}</span>
        <span className="block truncate text-muted-foreground text-xs">{subtitle}</span>
      </span>
      <span className="shrink-0 text-right">
        <AmountValue
          amount={displayAmount.amount}
          currency={displayAmount.currency}
          className={cn("text-sm", typeStyle.accent)}
        />
        <ConvertedAmount amount={convertedAmount} className="text-xs" />
      </span>
    </>
  );
}

function DetailedTransactionRow({
  transaction,
  primaryAccount,
  secondaryAccount,
  displayAmount,
  convertedAmount,
  showTransferPair,
}: Omit<Extract<TransactionRowProps, { variant: "detailed" }>, "onClick" | "variant">) {
  const typeStyle = TRANSACTION_TYPE_STYLE[resolveTransactionType(transaction.type)];
  const Icon = typeStyle.icon;
  const isTransfer = transaction.type === "transfer";

  return (
    <>
      <span className={cn("mt-0.5 shrink-0", typeStyle.accent)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 max-w-full truncate font-medium">{transactionTitle(transaction)}</span>
          {transaction.category ? (
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              {transaction.category}
            </span>
          ) : null}
          {transaction.importance ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium text-[11px]",
                IMPORTANCE_STYLE[transaction.importance].badge,
              )}
            >
              {IMPORTANCE_STYLE[transaction.importance].label}
            </span>
          ) : null}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 break-words text-muted-foreground text-sm">
          <span>{formatDateTimeDisplay(transaction.effectiveAt)}</span>
          <span>
            {primaryAccount?.labelText || "Untitled"}
            {isTransfer && secondaryAccount ? ` → ${secondaryAccount.labelText || "Untitled"}` : null}
          </span>
        </span>

        {transaction.notes ? (
          <span className="mt-1 line-clamp-2 block break-words text-muted-foreground text-sm">{transaction.notes}</span>
        ) : null}
      </span>

      <span className="shrink-0 text-right">
        {isTransfer && showTransferPair ? (
          <>
            <AmountValue
              amount={transaction.amount}
              currency={transaction.accountCurrency}
              className={typeStyle.accent}
            />
            {transaction.counterpartyAmount !== null ? (
              <AmountValue
                amount={transaction.counterpartyAmount}
                currency={transaction.counterpartyCurrency}
                className="mt-1 font-normal text-muted-foreground text-sm"
              />
            ) : null}
          </>
        ) : (
          <>
            <AmountValue amount={displayAmount.amount} currency={displayAmount.currency} className={typeStyle.accent} />
            <ConvertedAmount amount={convertedAmount} className="text-sm" />
          </>
        )}
      </span>
    </>
  );
}

export function TransactionRow(props: TransactionRowProps) {
  const { transaction, primaryAccount, secondaryAccount, displayAmount, convertedAmount, onClick, isAttachMode } =
    props;

  const content =
    props.variant === "compact" ? (
      <CompactTransactionRow
        transaction={transaction}
        primaryAccount={primaryAccount}
        secondaryAccount={secondaryAccount}
        displayAmount={displayAmount}
        convertedAmount={convertedAmount}
        isAttachMode={isAttachMode}
      />
    ) : (
      <DetailedTransactionRow
        transaction={transaction}
        primaryAccount={primaryAccount}
        secondaryAccount={secondaryAccount}
        displayAmount={displayAmount}
        convertedAmount={convertedAmount}
        showTransferPair={props.showTransferPair}
        isAttachMode={isAttachMode}
      />
    );

  const className = cn(
    "flex w-full min-w-0 gap-3 text-left",
    props.variant === "compact" ? "items-center px-4 py-2.5" : "items-start px-4 py-3",
    isAttachMode && "cursor-copy",
  );

  if (!onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={cn(className, "transition-colors hover:bg-muted/40")}>
      {content}
    </button>
  );
}
