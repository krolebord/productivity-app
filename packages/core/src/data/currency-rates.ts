import type { Kysely } from "kysely";
import { useDbQuery } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";

/** The newest stored rate row, which the finance overview converts with. */
export const latestCurrencyRateQuery = (q: Kysely<UserDb>) =>
  q.selectFrom("currency_rate").selectAll().orderBy("date", "desc").orderBy("baseCurrency", "asc").limit(1);

export function useLatestCurrencyRate() {
  const { data } = useDbQuery(latestCurrencyRateQuery);
  return data[0];
}
