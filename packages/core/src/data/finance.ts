import { type NetWorthPoint, netWorthQuery } from "../finance/net-worth";
import type { TrendBucket } from "../finance/overview";
import { useDbQuery } from "../user-db/db-context";

/** Net worth per bucket. Returns the full query result so callers can `refresh()` the open period. */
export function useNetWorthSeries({
  buckets,
  baseCurrency,
}: {
  buckets: readonly TrendBucket[];
  baseCurrency: string;
}) {
  return useDbQuery<NetWorthPoint>(netWorthQuery({ buckets, baseCurrency }));
}
