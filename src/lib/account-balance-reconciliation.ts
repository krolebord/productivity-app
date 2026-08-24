export type AccountBalanceReconciliationRow = {
  id: string;
  balance: number;
  nextBalance: number;
};

/**
 * Cached and recomputed balances are summed from `real` columns along different
 * paths (incremental updates vs. a single SQL SUM), so they can differ by a few
 * ULPs for an unchanged balance. Treat differences under this threshold (well
 * below a currency unit) as no change to avoid spurious update events.
 */
export const ACCOUNT_BALANCE_EPSILON = 1e-4;

/** Whether a recomputed balance differs from the cached one enough to write. */
export function accountBalanceChanged(balance: number, nextBalance: number) {
  return Math.abs(Number(balance) - Number(nextBalance)) >= ACCOUNT_BALANCE_EPSILON;
}

/**
 * Select every account's cached balance alongside the value derived from its
 * initial balance and all transaction effects.
 */
export const ACCOUNT_BALANCE_RECONCILIATION_SQL = `
  select
    account.id,
    account.balance,
    account.initialBalance
      + coalesce(source_totals.total, 0)
      + coalesce(destination_totals.total, 0) as nextBalance
  from account
  left join (
    select accountId, sum(amount) as total
    from transaction_entry
    group by accountId
  ) source_totals on source_totals.accountId = account.id
  left join (
    select counterpartyAccountId, sum(counterpartyAmount) as total
    from transaction_entry
    where counterpartyAccountId != '' and counterpartyAmount is not null
    group by counterpartyAccountId
  ) destination_totals on destination_totals.counterpartyAccountId = account.id
`;
