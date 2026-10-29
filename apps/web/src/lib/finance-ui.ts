import {
  amountTone,
  type FinanceTone,
  IMPORTANCE_CHART_COLOR,
  IMPORTANCE_LABELS,
  TRANSACTION_TYPE_META,
} from "@productivity/core/finance/appearance";
import type { ImportanceTier, TransactionType } from "@productivity/core/transactions";
import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, type LucideIcon, ScaleIcon } from "lucide-react";

/**
 * The shared visual vocabulary for finance surfaces: one place deciding what an
 * expense looks like, what colour "flexible" is, and how a signed amount is
 * tinted. Lists, badges and charts all read from here so they can't disagree.
 * Labels, tones and chart colours come from core so mobile matches; this file
 * only adds the web's icons and classes.
 */

/** Text colour per semantic tone. */
export const TONE_ACCENT: Record<FinanceTone, string> = {
  expense: "text-rose-600 dark:text-rose-400",
  income: "text-emerald-600 dark:text-emerald-400",
  transfer: "text-blue-600 dark:text-blue-400",
  adjustment: "text-amber-600 dark:text-amber-400",
  neutral: "text-foreground",
};

export const TRANSACTION_TYPE_STYLE = {
  expense: {
    ...TRANSACTION_TYPE_META.expense,
    icon: ArrowDownLeftIcon,
    accent: TONE_ACCENT.expense,
    dot: "bg-rose-500",
    activeClass: "bg-background text-rose-600 shadow-sm dark:bg-input/50 dark:text-rose-400",
  },
  income: {
    ...TRANSACTION_TYPE_META.income,
    icon: ArrowUpRightIcon,
    accent: TONE_ACCENT.income,
    dot: "bg-emerald-500",
    activeClass: "bg-background text-emerald-600 shadow-sm dark:bg-input/50 dark:text-emerald-400",
  },
  transfer: {
    ...TRANSACTION_TYPE_META.transfer,
    icon: ArrowLeftRightIcon,
    accent: TONE_ACCENT.transfer,
    dot: "bg-blue-500",
    activeClass: "bg-background text-blue-600 shadow-sm dark:bg-input/50 dark:text-blue-400",
  },
  adjustment: {
    ...TRANSACTION_TYPE_META.adjustment,
    icon: ScaleIcon,
    accent: TONE_ACCENT.adjustment,
    dot: "bg-amber-500",
    activeClass: "bg-background text-amber-600 shadow-sm dark:bg-input/50 dark:text-amber-400",
  },
} satisfies Record<
  TransactionType,
  {
    label: string;
    shortLabel: string;
    tone: FinanceTone;
    icon: LucideIcon;
    accent: string;
    dot: string;
    activeClass: string;
  }
>;

/**
 * Importance is a scale from unavoidable to discretionary, so badges use a
 * traffic-light ramp with investment set apart. Chart bars stay a red stack so
 * stacked expenses read as one expense series (darker = more fixed).
 */
export const IMPORTANCE_STYLE = {
  fixed: {
    label: IMPORTANCE_LABELS.fixed,
    badge: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    tintedBadge: "bg-red-500/10 text-red-600 dark:text-red-400",
    activeClass: "bg-background text-red-600 shadow-sm dark:bg-input/50 dark:text-red-400",
    chartColor: IMPORTANCE_CHART_COLOR.fixed,
  },
  flexible: {
    label: IMPORTANCE_LABELS.flexible,
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    tintedBadge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    activeClass: "bg-background text-amber-600 shadow-sm dark:bg-input/50 dark:text-amber-400",
    chartColor: IMPORTANCE_CHART_COLOR.flexible,
  },
  optional: {
    label: IMPORTANCE_LABELS.optional,
    badge: "bg-lime-50 text-lime-700 dark:bg-lime-950/50 dark:text-lime-400",
    tintedBadge: "bg-lime-500/10 text-lime-600 dark:text-lime-400",
    activeClass: "bg-background text-lime-600 shadow-sm dark:bg-input/50 dark:text-lime-400",
    chartColor: IMPORTANCE_CHART_COLOR.optional,
  },
  investment: {
    label: IMPORTANCE_LABELS.investment,
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    tintedBadge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    activeClass: "bg-background text-blue-600 shadow-sm dark:bg-input/50 dark:text-blue-400",
    chartColor: IMPORTANCE_CHART_COLOR.investment,
  },
} satisfies Record<
  ImportanceTier,
  { label: string; badge: string; tintedBadge: string; activeClass: string; chartColor: string }
>;

export { FLOW_COLOR } from "@productivity/core/finance/appearance";

export const CATEGORY_DONUT_PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** Untyped totals (net flow) are tinted by sign; transaction amounts use their type's accent. */
export function amountAccentClass(amount: number) {
  return TONE_ACCENT[amountTone(amount)];
}

export { resolveTransactionType, transactionTitle } from "@productivity/core/finance/appearance";
