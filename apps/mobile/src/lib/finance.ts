import { getCurrencyOptions } from "@productivity/core/currency/convert";
import { APP_CURRENCIES } from "@productivity/core/currency/currencies";
import { useLatestCurrencyRate } from "@productivity/core/data/currency-rates";
import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
import { createAmountConverter } from "@productivity/core/finance/overview";
import type { ImportanceTier, TransactionType } from "@productivity/core/transactions";
import { useMemo } from "react";
import type { IconName } from "../components/ui/icon";

export const TRANSACTION_TYPE_STYLE = {
  expense: {
    label: "Expense",
    icon: "arrow-down-left",
    accent: "text-rose-600 dark:text-rose-400",
    iconAccent: "accent-rose-600 dark:accent-rose-400",
  },
  income: {
    label: "Income",
    icon: "arrow-up-right",
    accent: "text-emerald-600 dark:text-emerald-400",
    iconAccent: "accent-emerald-600 dark:accent-emerald-400",
  },
  transfer: {
    label: "Transfer",
    icon: "repeat",
    accent: "text-blue-600 dark:text-blue-400",
    iconAccent: "accent-blue-600 dark:accent-blue-400",
  },
  adjustment: {
    label: "Adjustment",
    icon: "sliders",
    accent: "text-amber-600 dark:text-amber-400",
    iconAccent: "accent-amber-600 dark:accent-amber-400",
  },
} satisfies Record<TransactionType, { label: string; icon: IconName; accent: string; iconAccent: string }>;

export const IMPORTANCE_LABELS: Record<ImportanceTier, string> = {
  fixed: "Fixed",
  flexible: "Flexible",
  optional: "Optional",
  investment: "Invest",
};

/** Chart bars stay a red stack so stacked expenses read as one series (darker = more fixed), as on the web. */
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
  return type in TRANSACTION_TYPE_STYLE ? (type as TransactionType) : "expense";
}

export function transactionTitle(transaction: { title: string; type: string }) {
  return transaction.title || TRANSACTION_TYPE_STYLE[resolveTransactionType(transaction.type)].label;
}

export function amountAccentClass(amount: number) {
  if (amount > 0) return TRANSACTION_TYPE_STYLE.income.accent;
  if (amount < 0) return TRANSACTION_TYPE_STYLE.expense.accent;
  return "text-foreground";
}

/** The display currency and a converter built from the newest stored rate row, as on the web. */
export function useDisplayCurrency() {
  const { baseCurrency, setBaseCurrency } = useDashboardSettings();
  const latestRate = useLatestCurrencyRate();
  const convert = useMemo(() => createAmountConverter(latestRate, baseCurrency), [latestRate, baseCurrency]);

  return {
    baseCurrency,
    setBaseCurrency,
    latestRate,
    convert,
    currencyOptions: latestRate ? getCurrencyOptions(latestRate) : APP_CURRENCIES,
  };
}
