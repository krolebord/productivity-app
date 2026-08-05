import { useMemo } from "react";
import { getCurrencyOptions } from "@/lib/currency/convert";
import { APP_CURRENCIES } from "@/lib/currency/currencies";
import { useDashboardSettings } from "@/lib/dashboard-settings";
import { createAmountConverter } from "@/lib/finance/overview";
import { useDbQuery } from "@/user-db/user-db";

/**
 * The display currency and the converter built from the newest stored rate row.
 * Every finance surface reads it from here, so amounts can't be converted with
 * a different rate on one tab than another.
 */
export function useDisplayCurrency() {
  const { baseCurrency, setBaseCurrency } = useDashboardSettings();

  const { data: rates } = useDbQuery((db) =>
    db.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc").limit(1),
  );
  const latestRate = rates[0];

  const convert = useMemo(() => createAmountConverter(latestRate, baseCurrency), [latestRate, baseCurrency]);

  return {
    baseCurrency,
    setBaseCurrency,
    latestRate,
    convert,
    currencyOptions: latestRate ? getCurrencyOptions(latestRate) : APP_CURRENCIES,
  };
}
