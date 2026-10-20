import { getCurrencyOptions } from "@productivity/core/currency/convert";
import { APP_CURRENCIES } from "@productivity/core/currency/currencies";
import { useLatestCurrencyRate } from "@productivity/core/data/currency-rates";
import { createAmountConverter } from "@productivity/core/finance/overview";
import { useMemo } from "react";
import { useDashboardSettings } from "@/lib/dashboard-settings";

/**
 * The display currency and the converter built from the newest stored rate row.
 * Every finance surface reads it from here, so amounts can't be converted with
 * a different rate on one tab than another.
 */
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
