import type { ImportanceTier, TransactionType } from "../transactions";

/**
 * The platform-agnostic half of the finance visual vocabulary: what each
 * transaction type and importance tier is called, which tone it's tinted with,
 * and the hex colours charts draw with. Web and mobile map tones to their own
 * classes (each app's Tailwind only scans its own sources), so they can't
 * disagree on, say, which colour a transfer is.
 */

/**
 * A semantic tint: green income, red expenses, blue transfers, amber adjustments. Transaction
 * amounts take their type's tone, not their sign's, so a transfer out stays blue.
 */
export type FinanceTone = TransactionType | "neutral";

export const TRANSACTION_TYPE_META = {
  expense: { label: "Expense", shortLabel: "Expense", tone: "expense" },
  income: { label: "Income", shortLabel: "Income", tone: "income" },
  transfer: { label: "Transfer", shortLabel: "Transfer", tone: "transfer" },
  adjustment: { label: "Adjustment", shortLabel: "Adjust", tone: "adjustment" },
} as const satisfies Record<TransactionType, { label: string; shortLabel: string; tone: FinanceTone }>;

export const IMPORTANCE_LABELS: Record<ImportanceTier, string> = {
  fixed: "Fixed",
  flexible: "Flexible",
  optional: "Optional",
  investment: "Invest",
};

/** Chart bars stay a red stack so stacked expenses read as one expense series (darker = more fixed). */
export const IMPORTANCE_CHART_COLOR: Record<ImportanceTier, string> = {
  fixed: "#991b1b",
  flexible: "#ef4444",
  optional: "#f87171",
  investment: "#fca5a5",
};

/** Totals keep the income/expense tint even though they aren't typed rows. */
export const FLOW_COLOR = {
  income: "#10b981",
  expense: "#e11d48",
  net: "#3b82f6",
  netWorth: "#3b82f6",
} as const;

/** `type` is a free-text column, so narrow it before indexing into the styles. */
export function resolveTransactionType(type: string): TransactionType {
  return type in TRANSACTION_TYPE_META ? (type as TransactionType) : "expense";
}

/** Untitled entries fall back to their type name. */
export function transactionTitle(transaction: { title: string; type: string }) {
  return transaction.title || TRANSACTION_TYPE_META[resolveTransactionType(transaction.type)].label;
}

/** Untyped totals (net flow, balances) are tinted by sign. */
export function amountTone(amount: number): FinanceTone {
  if (amount > 0) return "income";
  if (amount < 0) return "expense";
  return "neutral";
}
