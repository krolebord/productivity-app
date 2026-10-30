import { endOfDay, format, isSameDay, isSameYear, startOfDay, startOfYear, subDays } from "date-fns";
import type { ImportanceFilter, TransactionFilters, TransactionSort } from "../data/transactions";
import { IMPORTANCE_LABELS, TRANSACTION_TYPE_META } from "./appearance";

/**
 * The transactions ledger's vocabulary, shared by the web page and the mobile list: sort
 * labels, time-range presets, how filters read as chips, and the day sections.
 */

export const TRANSACTION_SORT_LABELS = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  amount_desc: "Amount high to low",
  amount_asc: "Amount low to high",
  title_asc: "Title A to Z",
  title_desc: "Title Z to A",
} satisfies Record<TransactionSort, string>;

export type TimeRange = { from: number; to: number };

export const TIME_RANGE_PRESETS = [
  {
    id: "7d",
    label: "Last 7d",
    getRange: (now: Date): TimeRange => ({ from: startOfDay(subDays(now, 6)).getTime(), to: endOfDay(now).getTime() }),
  },
  {
    id: "30d",
    label: "Last 30d",
    getRange: (now: Date): TimeRange => ({ from: startOfDay(subDays(now, 29)).getTime(), to: endOfDay(now).getTime() }),
  },
  {
    id: "year",
    label: "Start of year",
    getRange: (now: Date): TimeRange => ({ from: startOfYear(now).getTime(), to: endOfDay(now).getTime() }),
  },
] as const;

export function formatTimeRangeLabel(from?: number, to?: number) {
  if (from && to) return `${format(from, "MMM d, yyyy")} - ${format(to, "MMM d, yyyy")}`;
  if (from) return `From ${format(from, "MMM d, yyyy")}`;
  if (to) return `Until ${format(to, "MMM d, yyyy")}`;
  return "All time";
}

export function importanceFilterLabel(importance: ImportanceFilter) {
  return importance === "none" ? "Unclassified" : IMPORTANCE_LABELS[importance];
}

export const TRANSACTION_FILTER_KEYS = ["account", "currency", "time", "type", "importance", "category"] as const;
export type TransactionFilterKey = (typeof TRANSACTION_FILTER_KEYS)[number];

export const TRANSACTION_FILTER_LABELS: Record<TransactionFilterKey, string> = {
  account: "Account",
  currency: "Currency",
  time: "Time range",
  type: "Type",
  importance: "Importance",
  category: "Category",
};

/**
 * Each active filter as a chip value, in display order. `accountLabel` names the filtered
 * account (the filters only carry its id).
 */
export function activeTransactionFilters(
  filters: TransactionFilters,
  accountLabel?: string,
): { key: TransactionFilterKey; label: string; value: string }[] {
  const values: Record<TransactionFilterKey, string | null> = {
    account: filters.accountId ? accountLabel || "Untitled" : null,
    currency: filters.currency || null,
    time: filters.from || filters.to ? formatTimeRangeLabel(filters.from, filters.to) : null,
    type: filters.type ? TRANSACTION_TYPE_META[filters.type].label : null,
    importance: filters.importance ? importanceFilterLabel(filters.importance) : null,
    category: filters.category || null,
  };
  return TRANSACTION_FILTER_KEYS.flatMap((key) => {
    const value = values[key];
    return value === null ? [] : [{ key, label: TRANSACTION_FILTER_LABELS[key], value }];
  });
}

/** The filters with one chip's worth removed. */
export function clearTransactionFilter(filters: TransactionFilters, key: TransactionFilterKey): TransactionFilters {
  switch (key) {
    case "account":
      return { ...filters, accountId: undefined };
    case "currency":
      return { ...filters, currency: undefined };
    case "time":
      return { ...filters, from: undefined, to: undefined };
    case "type":
      return { ...filters, type: undefined };
    case "importance":
      return { ...filters, importance: undefined };
    case "category":
      return { ...filters, category: undefined };
  }
}

export function formatDayHeader(timestamp: number, now = new Date()) {
  if (isSameDay(timestamp, now)) return "Today";
  if (isSameDay(timestamp, subDays(now, 1))) return "Yesterday";
  return format(timestamp, "EEEE, MMM d, yyyy");
}

/** Short form for tight headers: the year only when it isn't this one. */
export function formatShortDayHeader(timestamp: number, now = new Date()) {
  if (isSameDay(timestamp, now)) return "Today";
  if (isSameDay(timestamp, subDays(now, 1))) return "Yesterday";
  return format(timestamp, isSameYear(timestamp, now) ? "EEEE, MMM d" : "EEE, MMM d, yyyy");
}

export type TransactionDayGroup<T> = { key: string; timestamp: number | null; transactions: T[] };

/**
 * Consecutive transactions on the same local day, for date sorts. Other sorts don't run
 * in day order, so they come back as one headerless group.
 */
export function groupTransactionsByDay<T extends { effectiveAt: number }>(
  transactions: readonly T[],
  sort: TransactionSort,
): TransactionDayGroup<T>[] {
  if (sort !== "date_desc" && sort !== "date_asc") {
    return transactions.length > 0 ? [{ key: "__all__", timestamp: null, transactions: [...transactions] }] : [];
  }

  const groups: TransactionDayGroup<T>[] = [];
  for (const transaction of transactions) {
    const key = format(transaction.effectiveAt, "yyyy-MM-dd");
    const last = groups.at(-1);
    if (last?.key === key) last.transactions.push(transaction);
    else groups.push({ key, timestamp: transaction.effectiveAt, transactions: [transaction] });
  }
  return groups;
}
