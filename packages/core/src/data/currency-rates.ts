import type { Kysely } from "kysely";
import { useDbQuery } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";

/** Stored rate rows, newest first. */
export function useCurrencyRates() {
  const { data } = useDbQuery((db) =>
    db.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc"),
  );
  return data;
}

/** The newest stored rate row, which the finance overview converts with. */
export const latestCurrencyRateQuery = (q: Kysely<UserDb>) =>
  q.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc").limit(1);

export function useLatestCurrencyRate() {
  const { data } = useDbQuery(latestCurrencyRateQuery);
  return data[0];
}
