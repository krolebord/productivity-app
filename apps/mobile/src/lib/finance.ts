import { getCurrencyOptions } from "@productivity/core/currency/convert";
import { APP_CURRENCIES } from "@productivity/core/currency/currencies";
import { useLatestCurrencyRate } from "@productivity/core/data/currency-rates";
import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
import { amountTone, type FinanceTone, TRANSACTION_TYPE_META } from "@productivity/core/finance/appearance";
import { createAmountConverter } from "@productivity/core/finance/overview";
import type { TransactionType } from "@productivity/core/transactions";
import { useMemo } from "react";
import type { IconName } from "../components/ui/icon";

/** Text and icon colour per semantic tone; the tone mapping itself lives in core, shared with the web. */
export const TONE_STYLE: Record<FinanceTone, { accent: string; iconAccent: string }> = {
  expense: { accent: "text-rose-600 dark:text-rose-400", iconAccent: "accent-rose-600 dark:accent-rose-400" },
  income: {
    accent: "text-emerald-600 dark:text-emerald-400",
    iconAccent: "accent-emerald-600 dark:accent-emerald-400",
  },
  transfer: { accent: "text-blue-600 dark:text-blue-400", iconAccent: "accent-blue-600 dark:accent-blue-400" },
  adjustment: { accent: "text-amber-600 dark:text-amber-400", iconAccent: "accent-amber-600 dark:accent-amber-400" },
  neutral: { accent: "text-foreground", iconAccent: "accent-foreground" },
};

export const TRANSACTION_TYPE_STYLE = {
  expense: { ...TRANSACTION_TYPE_META.expense, ...TONE_STYLE.expense, icon: "arrow-down-left" },
  income: { ...TRANSACTION_TYPE_META.income, ...TONE_STYLE.income, icon: "arrow-up-right" },
  transfer: { ...TRANSACTION_TYPE_META.transfer, ...TONE_STYLE.transfer, icon: "repeat" },
  adjustment: { ...TRANSACTION_TYPE_META.adjustment, ...TONE_STYLE.adjustment, icon: "sliders" },
} satisfies Record<TransactionType, { label: string; shortLabel: string; icon: IconName; accent: string }>;

/**
 * Reads a typed amount, or NaN when it isn't a plain number. Either "." or "," can be the
 * decimal mark (iOS decimal pads type the locale's): it's the last separator when both kinds
 * appear ("1,234.50", "1.234,50") or there's only one ("12,5"). Any others must group
 * thousands ("1,234,567").
 */
export function parseAmountInput(text: string): number {
  const value = text.replace(/[\s\u00a0\u202f']/g, "").replace(/^[\u2212\u2013]/, "-");
  const separators = value.match(/[.,]/g) ?? [];
  const decimalAt =
    new Set(separators).size > 1 || separators.length === 1
      ? Math.max(value.lastIndexOf("."), value.lastIndexOf(","))
      : -1;
  const whole = decimalAt >= 0 ? value.slice(0, decimalAt) : value;
  const fraction = decimalAt >= 0 ? value.slice(decimalAt + 1) : "";
  if (!/^-?(\d*|\d{1,3}([.,]\d{3})+)$/.test(whole) || !/^\d*$/.test(fraction)) return Number.NaN;
  const digits = whole.replace(/[.,]/g, "");
  if (!/\d/.test(digits + fraction)) return Number.NaN;
  return Number(`${digits}.${fraction || "0"}`);
}

/** Untyped totals (net flow) are tinted by sign; transaction amounts use their type's accent. */
export function amountAccentClass(amount: number) {
  return TONE_STYLE[amountTone(amount)].accent;
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
