import { formatBalance } from "@productivity/core/currency/format";
import type { FlowTotals } from "@productivity/core/finance/overview";
import { TrendingDownIcon, TrendingUpIcon, WalletIcon } from "lucide-react";
import type { ReactNode } from "react";
import { amountAccentClass, TRANSACTION_TYPE_STYLE } from "@/lib/finance-ui";
import { cn } from "@/lib/utils";

function SummaryCard({
  label,
  marker,
  value,
  valueClassName,
  footnote,
}: {
  label: string;
  marker: ReactNode;
  value: string;
  valueClassName?: string;
  footnote?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {marker}
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className={cn("mt-2 font-mono font-semibold text-2xl tabular-nums", valueClassName)}>{value}</p>
      {footnote ? <p className="mt-1 text-muted-foreground text-xs">{footnote}</p> : null}
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("size-2 rounded-full", className)} />;
}

export function FinanceSummaryCards({
  accountCount,
  baseCurrency,
  cardSuffix,
  flow,
  netDelta,
  netWorth,
  prevLabel,
  unconvertibleAccounts,
}: {
  accountCount: number;
  baseCurrency: string;
  /** Short range label appended to the period-scoped cards, e.g. "30d". */
  cardSuffix: string;
  flow: FlowTotals;
  netDelta: number;
  netWorth: number;
  prevLabel: string;
  unconvertibleAccounts: number;
}) {
  return (
    <div className="grid @4xl:grid-cols-4 @lg:grid-cols-2 grid-cols-[minmax(0,1fr)] gap-3">
      <SummaryCard
        label="Net worth"
        marker={<WalletIcon className="size-4" />}
        value={formatBalance(netWorth, baseCurrency)}
        footnote={
          <>
            {accountCount} account{accountCount === 1 ? "" : "s"}
            {unconvertibleAccounts > 0 ? ` · ${unconvertibleAccounts} not converted` : ""}
          </>
        }
      />

      <SummaryCard
        label={`Income (${cardSuffix})`}
        marker={<Dot className="bg-emerald-500" />}
        value={formatBalance(flow.income, baseCurrency)}
        valueClassName={TRANSACTION_TYPE_STYLE.income.accent}
      />

      <SummaryCard
        label={`Expenses (${cardSuffix})`}
        marker={<Dot className="bg-rose-500" />}
        value={formatBalance(flow.expense, baseCurrency)}
        valueClassName={TRANSACTION_TYPE_STYLE.expense.accent}
      />

      <SummaryCard
        label={`Net (${cardSuffix})`}
        marker={netDelta >= 0 ? <TrendingUpIcon className="size-4" /> : <TrendingDownIcon className="size-4" />}
        value={formatBalance(flow.net, baseCurrency)}
        valueClassName={amountAccentClass(flow.net)}
        footnote={
          <>
            {netDelta >= 0 ? "+" : "−"}
            {formatBalance(Math.abs(netDelta), baseCurrency)} vs {prevLabel}
          </>
        }
      />
    </div>
  );
}
