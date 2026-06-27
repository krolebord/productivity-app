import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppCurrencyCode } from "@/lib/currency/currencies";

interface BaseCurrencyStore {
  baseCurrency: AppCurrencyCode;
  setBaseCurrency: (currency: AppCurrencyCode) => void;
}

/** The currency the Overview converts every balance and total into. */
export const useBaseCurrencyStore = create<BaseCurrencyStore>()(
  persist(
    (set) => ({
      baseCurrency: "USD",
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
    }),
    { name: "productivity-base-currency" },
  ),
);
