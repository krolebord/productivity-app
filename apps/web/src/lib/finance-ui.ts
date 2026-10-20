import type { ImportanceTier, TransactionType } from "@productivity/core/transactions";
import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, type LucideIcon, ScaleIcon } from "lucide-react";

/**
 * The shared visual vocabulary for finance surfaces: one place deciding what an
 * expense looks like, what colour "flexible" is, and how a signed amount is
 * tinted. Lists, badges and charts all read from here so they can't disagree.
 */

export const TRANSACTION_TYPE_STYLE = {
  expense: {
    label: "Expense",
    shortLabel: "Expense",
    icon: ArrowDownLeftIcon,
    accent: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
    activeClass: "bg-background text-rose-600 shadow-sm dark:bg-input/50 dark:text-rose-400",
  },
  income: {
    label: "Income",
    shortLabel: "Income",
    icon: ArrowUpRightIcon,
    accent: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    activeClass: "bg-background text-emerald-600 shadow-sm dark:bg-input/50 dark:text-emerald-400",
  },
  transfer: {
    label: "Transfer",
    shortLabel: "Transfer",
    icon: ArrowLeftRightIcon,
    accent: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    activeClass: "bg-background text-blue-600 shadow-sm dark:bg-input/50 dark:text-blue-400",
  },
  adjustment: {
    label: "Adjustment",
    shortLabel: "Adjust",
    icon: ScaleIcon,
    accent: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    activeClass: "bg-background text-amber-600 shadow-sm dark:bg-input/50 dark:text-amber-400",
  },
} satisfies Record<
  TransactionType,
  { label: string; shortLabel: string; icon: LucideIcon; accent: string; dot: string; activeClass: string }
>;

/**
 * Importance is a scale from unavoidable to discretionary, so badges use a
 * traffic-light ramp with investment set apart. Chart bars stay a red stack so
 * stacked expenses read as one expense series (darker = more fixed).
 */
export const IMPORTANCE_STYLE = {
  fixed: {
    label: "Fixed",
    badge: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    tintedBadge: "bg-red-500/10 text-red-600 dark:text-red-400",
    activeClass: "bg-background text-red-600 shadow-sm dark:bg-input/50 dark:text-red-400",
    chartColor: "#991b1b",
  },
  flexible: {
    label: "Flexible",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    tintedBadge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    activeClass: "bg-background text-amber-600 shadow-sm dark:bg-input/50 dark:text-amber-400",
    chartColor: "#ef4444",
  },
  optional: {
    label: "Optional",
    badge: "bg-lime-50 text-lime-700 dark:bg-lime-950/50 dark:text-lime-400",
    tintedBadge: "bg-lime-500/10 text-lime-600 dark:text-lime-400",
    activeClass: "bg-background text-lime-600 shadow-sm dark:bg-input/50 dark:text-lime-400",
    chartColor: "#f87171",
  },
  investment: {
    label: "Invest",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    tintedBadge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    activeClass: "bg-background text-blue-600 shadow-sm dark:bg-input/50 dark:text-blue-400",
    chartColor: "#fca5a5",
  },
} satisfies Record<
  ImportanceTier,
  { label: string; badge: string; tintedBadge: string; activeClass: string; chartColor: string }
>;

/** Totals keep the income/expense tint even though they aren't typed rows. */
export const FLOW_COLOR = {
  income: "#10b981",
  expense: "#e11d48",
  net: "#3b82f6",
  netWorth: "#3b82f6",
} as const;

export const CATEGORY_DONUT_PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function amountAccentClass(amount: number) {
  if (amount > 0) {
    return TRANSACTION_TYPE_STYLE.income.accent;
  }
  if (amount < 0) {
    return TRANSACTION_TYPE_STYLE.expense.accent;
  }
  return "text-foreground";
}

/** `type` is a free-text column, so narrow it before indexing into the styles. */
export function resolveTransactionType(type: string): TransactionType {
  return type in TRANSACTION_TYPE_STYLE ? (type as TransactionType) : "expense";
}

/** Untitled entries fall back to their type name. */
export function transactionTitle(transaction: { title: string; type: string }) {
  return transaction.title || TRANSACTION_TYPE_STYLE[resolveTransactionType(transaction.type)].label;
}
