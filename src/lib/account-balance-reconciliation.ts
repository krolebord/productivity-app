export type AccountBalanceReconciliationRow = {
  id: string;
  balance: number;
  nextBalance: number;
};

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
