import { format } from "date-fns";
import { APP_CURRENCIES } from "@/lib/currency/currencies";
import type { TrendBucket } from "./overview";

export type NetWorthPoint = {
  label: string;
  netWorth: number | null;
  missingCurrencies: number;
  estimatedCurrencies: number;
};

function rateFor(currency: string) {
  return `case when ${currency} = r.baseCurrency then 1 else case ${currency}
    ${APP_CURRENCIES.map((code) => `when '${code}' then r."${code}"`).join("\n")}
    end end`;
}

const sourceRate = rateFor("b.currency");
const displayRate = rateFor("settings.displayCurrency");
const usableRates = `${sourceRate} > 0 and ${displayRate} > 0`;

const NET_WORTH_SQL = `
  with points as (
    select cast(key as integer) as pointIndex,
      json_extract(value, '$.label') as label,
      coalesce(json_extract(value, '$.end'), unixepoch('subsec') * 1000) as cutoff,
      json_extract(value, '$.date') as rateDate
    from json_each(?)
  ), settings as (
    select ? as displayCurrency
  ), included_accounts as (
    select id, currency, balance from account where excludeFromDashboard = 0
  ), current_balances as (
    select currency, sum(balance) as balance from included_accounts group by currency
  ), effects as materialized (
    select t.accountCurrency as currency, t.amount, t.effectiveAt
    from transaction_entry t join included_accounts a on a.id = t.accountId
    where t.effectiveAt > (select min(cutoff) from points)
    union all
    select t.counterpartyCurrency, t.counterpartyAmount, t.effectiveAt
    from transaction_entry t join included_accounts a on a.id = t.counterpartyAccountId
    where t.counterpartyAmount is not null
      and t.effectiveAt > (select min(cutoff) from points)
  ), balances as (
    select p.pointIndex, p.rateDate, c.currency,
      c.balance - coalesce((
        select sum(e.amount) from effects e
        where e.currency = c.currency and e.effectiveAt > p.cutoff
      ), 0) as balance
    from points p cross join current_balances c
  ), converted as (
    select b.pointIndex,
      case when b.currency = settings.displayCurrency or b.balance = 0 then b.balance
        else b.balance / ${sourceRate} * ${displayRate} end as value,
      case when b.currency != settings.displayCurrency and b.balance != 0 and r.id is null
        then 1 else 0 end as missing,
      case when b.currency != settings.displayCurrency and b.balance != 0 and r.date != b.rateDate
        then 1 else 0 end as estimated
    from balances b cross join settings
    left join currency_rate r on b.currency != settings.displayCurrency and b.balance != 0
      and r.id = coalesce(
        (select r.id from currency_rate r
          where r.date >= b.rateDate and ${usableRates}
          order by r.date asc, r.baseCurrency asc limit 1),
        (select r.id from currency_rate r
          where r.date < b.rateDate and ${usableRates}
          order by r.date desc, r.baseCurrency asc limit 1)
      )
  )
  select p.label,
    case when sum(c.missing) > 0 then null else coalesce(sum(c.value), 0) end as netWorth,
    coalesce(sum(c.missing), 0) as missingCurrencies,
    coalesce(sum(c.estimated), 0) as estimatedCurrencies
  from points p left join converted c on c.pointIndex = p.pointIndex
  group by p.pointIndex, p.label
  order by p.pointIndex
`;

export function netWorthQuery({ buckets, baseCurrency }: { buckets: readonly TrendBucket[]; baseCurrency: string }) {
  const points = buckets.map((bucket, index) => {
    const isCurrent = index === buckets.length - 1;
    return {
      label: bucket.label,
      // SQLite evaluates the open period's cutoff on every live-query refresh.
      end: isCurrent ? null : bucket.end,
      date: format(isCurrent ? new Date() : new Date(bucket.end), "yyyy-MM-dd"),
    };
  });

  return { sql: NET_WORTH_SQL, parameters: [JSON.stringify(points), baseCurrency] };
}
