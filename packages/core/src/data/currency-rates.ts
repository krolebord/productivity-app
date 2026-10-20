import { useDbQuery } from "../user-db/db-context";

/** Stored rate rows, newest first. */
export function useCurrencyRates() {
  const { data } = useDbQuery((db) =>
    db.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc"),
  );
  return data;
}

export function useLatestCurrencyRate() {
  const { data } = useDbQuery((db) =>
    db.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc").limit(1),
  );
  return data[0];
}
