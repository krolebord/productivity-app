import { type SelectQueryBuilder, sql } from "kysely";
import { IMPORTANCE_TIERS, type TransactionType } from "../transactions";
import { useDbQuery } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";

export const TRANSACTION_SORTS = [
  "date_desc",
  "date_asc",
  "amount_desc",
  "amount_asc",
  "title_asc",
  "title_desc",
] as const;
export type TransactionSort = (typeof TRANSACTION_SORTS)[number];

export const IMPORTANCE_FILTERS = [...IMPORTANCE_TIERS, "none"] as const;
export type ImportanceFilter = (typeof IMPORTANCE_FILTERS)[number];

export type TransactionFilters = {
  accountId?: string;
  category?: string;
  currency?: string;
  from?: number;
  importance?: ImportanceFilter;
  q?: string;
  to?: number;
  type?: TransactionType;
};

function applyTransactionFilters<O>(
  query: SelectQueryBuilder<UserDb, "transaction_entry", O>,
  filters: TransactionFilters,
) {
  const accountId = filters.accountId;
  if (accountId) {
    query = query.where((eb) => eb.or([eb("accountId", "=", accountId), eb("counterpartyAccountId", "=", accountId)]));
  }

  if (filters.type) {
    query = query.where("type", "=", filters.type);
  }

  if (filters.currency) {
    const currency = filters.currency;
    query = query.where((eb) =>
      eb.or([eb("accountCurrency", "=", currency), eb("counterpartyCurrency", "=", currency)]),
    );
  }

  if (filters.category) {
    query = query.where("category", "like", `%${filters.category}%`);
  }

  if (filters.importance) {
    query =
      filters.importance === "none"
        ? query.where("importance", "is", null)
        : query.where("importance", "=", filters.importance);
  }

  if (filters.from) {
    query = query.where("effectiveAt", ">=", filters.from);
  }

  if (filters.to) {
    query = query.where("effectiveAt", "<=", filters.to);
  }

  if (filters.q) {
    const q = filters.q;
    query = query.where((eb) =>
      eb.or([eb("title", "like", `%${q}%`), eb("notes", "like", `%${q}%`), eb("category", "like", `%${q}%`)]),
    );
  }

  return query;
}

function applyTransactionSort<O>(query: SelectQueryBuilder<UserDb, "transaction_entry", O>, sort: TransactionSort) {
  switch (sort) {
    case "date_asc":
      return query.orderBy("effectiveAt", "asc").orderBy("createdAt", "asc");
    case "amount_desc":
      return query
        .orderBy(sql<number>`abs(amount)`, "desc")
        .orderBy("effectiveAt", "desc")
        .orderBy("createdAt", "desc");
    case "amount_asc":
      return query.orderBy(sql<number>`abs(amount)`, "asc").orderBy("effectiveAt", "desc").orderBy("createdAt", "desc");
    case "title_asc":
      return query.orderBy("title", "asc").orderBy("effectiveAt", "desc").orderBy("createdAt", "desc");
    case "title_desc":
      return query.orderBy("title", "desc").orderBy("effectiveAt", "desc").orderBy("createdAt", "desc");
    case "date_desc":
      return query.orderBy("effectiveAt", "desc").orderBy("createdAt", "desc");
  }
}

/** The first `limit` matching transactions, plus whether more exist past them. */
export function useTransactionPage(filters: TransactionFilters, sort: TransactionSort, limit: number) {
  const { data } = useDbQuery((db) =>
    applyTransactionSort(applyTransactionFilters(db.selectFrom("transaction_entry").selectAll(), filters), sort).limit(
      limit + 1,
    ),
  );
  const hasMore = data.length > limit;
  return { transactions: hasMore ? data.slice(0, limit) : data, hasMore };
}

export function useTransactionCount(filters: TransactionFilters) {
  const { data } = useDbQuery((db) =>
    applyTransactionFilters(db.selectFrom("transaction_entry"), filters).select((eb) =>
      eb.fn.countAll<number>().as("count"),
    ),
  );
  return Number(data[0]?.count ?? 0);
}

export function useTransaction(transactionId: string | null | undefined) {
  const { data } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .selectAll()
      .where("id", "=", transactionId ?? ""),
  );
  return data[0];
}

export function useTransactionsByIds(ids: readonly string[]) {
  const { data } = useDbQuery((db) =>
    // `in ()` is invalid SQL, so fall back to a sentinel that matches nothing.
    db
      .selectFrom("transaction_entry")
      .selectAll()
      .where("id", "in", ids.length > 0 ? ids : [""]),
  );
  return data;
}

/** Distinct non-empty categories, alphabetically. */
export function useTransactionCategories() {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select("category")
      .distinct()
      .where("category", "!=", "")
      .orderBy("category", "asc"),
  );
  return data.map((row) => row.category);
}

/** Distinct currencies on either leg of any transaction, including ones no account uses anymore. */
export function useTransactionCurrencies() {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select("accountCurrency as currency")
      .union(
        db
          .selectFrom("transaction_entry")
          .select("counterpartyCurrency as currency")
          .where("counterpartyCurrency", "!=", ""),
      ),
  );
  return data.map((row) => row.currency);
}

/** Distinct non-empty categories, most recently used first. */
export function useRecentTransactionCategories() {
  const { data } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select((eb) => ["category", eb.fn.max("effectiveAt").as("lastUsedAt")])
      .where("category", "!=", "")
      .groupBy("category")
      .orderBy("lastUsedAt", "desc"),
  );
  return data.map((row) => row.category);
}

/** Expense counts per (category, importance), for classified expenses only. */
export function useCategoryImportanceCounts() {
  const { data } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select((eb) => ["category", "importance", eb.fn.count<number>("id").as("count")])
      .where("type", "=", "expense")
      .where("category", "!=", "")
      .where("importance", "is not", null)
      .groupBy(["category", "importance"]),
  );
  return data;
}

/** Expense counts per category; `unclassifiedOnly` limits them to expenses without an importance. */
export function useExpenseCategoryCounts({ unclassifiedOnly }: { unclassifiedOnly: boolean }) {
  const { data } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select((eb) => ["category", eb.fn.count<number>("id").as("count")])
      .where("type", "=", "expense")
      .where("category", "!=", "")
      .$if(unclassifiedOnly, (qb) => qb.where("importance", "is", null))
      .groupBy("category"),
  );
  return data;
}

export function useUnclassifiedExpenseCount() {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("type", "=", "expense")
      .where("category", "!=", "")
      .where("importance", "is", null),
  );
  return Number(data[0]?.count ?? 0);
}

export function useCategoryExamples(category: string) {
  const { data } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select(["id", "title", "amount", "accountCurrency", "effectiveAt", "type"])
      .where("type", "=", "expense")
      .where("category", "=", category || "\u0000")
      .orderBy("effectiveAt", "desc")
      .limit(5),
  );
  return data;
}

export function useImportedProviderIds(providerType: string) {
  const { data } = useDbQuery((q) =>
    q.selectFrom("transaction_entry").select(["providerId"]).where("providerType", "=", providerType),
  );
  return data;
}

type AccountScope = { excludedAccountIds?: readonly string[] };
type TimeRange = { start: number; end: number };

/** Summed amounts per (type, account currency) within a time range. */
export function useFlowTotalsByCurrency({ start, end, excludedAccountIds = [] }: TimeRange & AccountScope) {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select((eb) => ["type", "accountCurrency", eb.fn.sum<number>("amount").as("total")])
      .where("effectiveAt", ">=", start)
      .where("effectiveAt", "<=", end)
      .$if(excludedAccountIds.length > 0, (qb) => qb.where("accountId", "not in", excludedAccountIds))
      .groupBy(["type", "accountCurrency"]),
  );
  return data;
}

export function useExpenseEntries({ start, end, excludedAccountIds = [] }: TimeRange & AccountScope) {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select(["accountCurrency", "accountId", "amount", "category", "effectiveAt"])
      .where("type", "=", "expense")
      .where("effectiveAt", ">=", start)
      .where("effectiveAt", "<=", end)
      .$if(excludedAccountIds.length > 0, (qb) => qb.where("accountId", "not in", excludedAccountIds)),
  );
  return data;
}

export function useIncomeAndExpenseEntries({ start, end }: TimeRange) {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select(["effectiveAt", "type", "accountId", "accountCurrency", "amount", "importance"])
      .where("effectiveAt", ">=", start)
      .where("effectiveAt", "<=", end)
      .where("type", "in", ["income", "expense"]),
  );
  return data;
}

export function useRecentTransactions({ limit, excludedAccountIds = [] }: { limit: number } & AccountScope) {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .selectAll()
      .$if(excludedAccountIds.length > 0, (qb) => qb.where("accountId", "not in", excludedAccountIds))
      .orderBy("effectiveAt", "desc")
      .orderBy("createdAt", "desc")
      .limit(limit),
  );
  return data;
}
