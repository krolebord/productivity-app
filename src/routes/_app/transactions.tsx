import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { endOfDay, format, startOfDay, startOfYear, subDays } from "date-fns";
import { type SelectQueryBuilder, sql } from "kysely";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  Landmark,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { formatBalance } from "@/components/account-card";
import {
  useCreateExpense,
  useCreateIncome,
  useCreateTransfer,
  useTransactionDialogStore,
} from "@/components/transaction-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeDisplay } from "@/lib/date-time";
import { getDisplayAmountForAccount, TRANSACTION_TYPES, type TransactionType } from "@/lib/transactions";
import { useAttachToAssistant } from "@/lib/use-attach-to-assistant";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { UserDb } from "@/user-db/migrations";
import { useDbQuery } from "@/user-db/user-db";

const TRANSACTION_SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc", "title_asc", "title_desc"] as const;
type TransactionSort = (typeof TRANSACTION_SORTS)[number];

const transactionsSearchSchema = z.object({
  accountId: z.string().optional(),
  category: z.string().optional(),
  from: z.coerce.number().finite().optional(),
  q: z.string().optional(),
  sort: z.enum(TRANSACTION_SORTS).optional(),
  to: z.coerce.number().finite().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
});

type TransactionsSearch = z.infer<typeof transactionsSearchSchema>;

const DEFAULT_LIMIT = 50;

function applyTransactionFilters<O>(
  query: SelectQueryBuilder<UserDb, "transaction_entry", O>,
  search: TransactionsSearch,
) {
  const accountId = search.accountId;
  if (accountId) {
    query = query.where((eb) => eb.or([eb("accountId", "=", accountId), eb("counterpartyAccountId", "=", accountId)]));
  }

  if (search.type) {
    query = query.where("type", "=", search.type);
  }

  if (search.category) {
    query = query.where("category", "like", `%${search.category}%`);
  }

  if (search.from) {
    query = query.where("effectiveAt", ">=", search.from);
  }

  if (search.to) {
    query = query.where("effectiveAt", "<=", search.to);
  }

  if (search.q) {
    const q = search.q;
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

export const Route = createFileRoute("/_app/transactions")({
  component: TransactionsPage,
  validateSearch: transactionsSearchSchema,
});

const TYPE_STYLE = {
  expense: {
    icon: ArrowDownLeftIcon,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    accent: "text-red-600 dark:text-red-400",
  },
  income: {
    icon: ArrowUpRightIcon,
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  transfer: {
    icon: ArrowLeftRightIcon,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    accent: "text-blue-600 dark:text-blue-400",
  },
  adjustment: {
    icon: SlidersHorizontalIcon,
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    accent: "text-amber-600 dark:text-amber-400",
  },
} satisfies Record<TransactionType, { icon: unknown; dot: string; badge: string; accent: string }>;

const SORT_LABELS = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  amount_desc: "Amount high to low",
  amount_asc: "Amount low to high",
  title_asc: "Title A to Z",
  title_desc: "Title Z to A",
} satisfies Record<TransactionSort, string>;

const TIME_RANGE_PRESETS = [
  {
    id: "7d",
    label: "Last 7d",
    getRange: () => {
      const now = new Date();
      return {
        from: startOfDay(subDays(now, 6)).getTime(),
        to: endOfDay(now).getTime(),
      };
    },
  },
  {
    id: "30d",
    label: "Last 30d",
    getRange: () => {
      const now = new Date();
      return {
        from: startOfDay(subDays(now, 29)).getTime(),
        to: endOfDay(now).getTime(),
      };
    },
  },
  {
    id: "year",
    label: "Start of year",
    getRange: () => {
      const now = new Date();
      return {
        from: startOfYear(now).getTime(),
        to: endOfDay(now).getTime(),
      };
    },
  },
] as const;

function summaryAmountClass(amount: number) {
  if (amount > 0) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (amount < 0) {
    return "text-rose-600 dark:text-rose-400";
  }

  return "text-foreground";
}

function renderCurrencyBreakdown(summaryByCurrency: Map<string, number>) {
  if (summaryByCurrency.size === 0) {
    return <span className="font-mono font-semibold text-lg tabular-nums">0</span>;
  }

  return (
    <div className="space-y-1">
      {Array.from(summaryByCurrency.entries()).map(([currency, amount]) => (
        <p key={currency} className={cn("font-mono font-semibold text-lg tabular-nums", summaryAmountClass(amount))}>
          {formatBalance(amount, currency)}
        </p>
      ))}
    </div>
  );
}

function formatTimeRangeLabel(from?: number, to?: number) {
  if (from && to) {
    return `${format(from, "MMM d, yyyy")} - ${format(to, "MMM d, yyyy")}`;
  }

  if (from) {
    return `From ${format(from, "MMM d, yyyy")}`;
  }

  if (to) {
    return `Until ${format(to, "MMM d, yyyy")}`;
  }

  return "All time";
}

function TransactionsPage() {
  const search = Route.useSearch();
  const sort = search.sort ?? "date_desc";
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const openEdit = useTransactionDialogStore((state) => state.openEdit);
  const { isContextKeyHeld, getAttachClickHandler } = useAttachToAssistant();
  const createExpense = useCreateExpense(search.accountId ? { accountId: search.accountId } : undefined);
  const createIncome = useCreateIncome(search.accountId ? { accountId: search.accountId } : undefined);
  const createTransfer = useCreateTransfer(search.accountId ? { accountId: search.accountId } : undefined);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  // Reset to the default page size whenever the active filters change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed on filter values, not setLimit.
  useEffect(() => {
    setLimit(DEFAULT_LIMIT);
  }, [search.accountId, search.type, search.category, search.from, search.q, search.sort, search.to]);

  const { data: accounts } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"));

  const { data: categoryRows } = useDbQuery((db) =>
    db
      .selectFrom("transaction_entry")
      .select("category")
      .distinct()
      .where("category", "!=", "")
      .orderBy("category", "asc"),
  );
  const categories = categoryRows.map((row) => row.category);

  // Fetch one extra row beyond the limit so we can tell whether more remain.
  const { data: transactions } = useDbQuery((db) =>
    applyTransactionSort(applyTransactionFilters(db.selectFrom("transaction_entry").selectAll(), search), sort).limit(
      limit + 1,
    ),
  );

  // Aggregate the full filtered set in SQL so the summary cards stay accurate
  // regardless of how many rows are currently rendered.
  const { data: summaryRows } = useDbQuery((db) =>
    applyTransactionFilters(db.selectFrom("transaction_entry"), search)
      .select((eb) => [
        "type",
        "accountCurrency",
        eb.fn.sum<number>("amount").as("total"),
        eb.fn.countAll<number>().as("count"),
      ])
      .groupBy(["type", "accountCurrency"]),
  );

  const hasMore = transactions.length > limit;
  const visibleTransactions = hasMore ? transactions.slice(0, limit) : transactions;

  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const selectedAccount = search.accountId ? accountMap.get(search.accountId) : undefined;

  const summary = {
    expenseByCurrency: new Map<string, number>(),
    incomeByCurrency: new Map<string, number>(),
    netByCurrency: new Map<string, number>(),
  };
  let totalEntries = 0;

  for (const row of summaryRows) {
    const currency = row.accountCurrency;
    const total = Number(row.total ?? 0);
    totalEntries += Number(row.count ?? 0);

    if (!currency) {
      continue;
    }

    // Income amounts are stored positive, expenses negative. Adjustments and
    // transfers are excluded from income/expense/net totals.
    if (row.type === "income") {
      summary.incomeByCurrency.set(currency, (summary.incomeByCurrency.get(currency) ?? 0) + total);
      summary.netByCurrency.set(currency, (summary.netByCurrency.get(currency) ?? 0) + total);
    } else if (row.type === "expense") {
      summary.expenseByCurrency.set(currency, (summary.expenseByCurrency.get(currency) ?? 0) + Math.abs(total));
      summary.netByCurrency.set(currency, (summary.netByCurrency.get(currency) ?? 0) + total);
    }
  }

  function patchSearch(next: Partial<typeof search>) {
    navigate({
      to: "/transactions",
      search: (prev) => {
        const merged = { ...prev, ...next };
        return {
          accountId: merged.accountId || undefined,
          category: merged.category || undefined,
          from: merged.from || undefined,
          q: merged.q || undefined,
          sort: merged.sort === "date_desc" ? undefined : merged.sort,
          to: merged.to || undefined,
          type: merged.type || undefined,
        };
      },
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-semibold text-xl">Transactions</h1>
          <p className="text-muted-foreground text-sm">
            {selectedAccount
              ? `Showing ledger activity for ${selectedAccount.labelText || "Untitled account"}.`
              : "Track expenses, income, transfers, and balance adjustments."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={createExpense} size="sm">
            <ArrowDownLeftIcon className="size-4" />
            Expense
          </Button>
          <Button onClick={createIncome} size="sm" variant="outline">
            <ArrowUpRightIcon className="size-4" />
            Income
          </Button>
          <Button onClick={createTransfer} size="sm" variant="outline">
            <ArrowLeftRightIcon className="size-4" />
            Transfer
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Income</p>
          </div>
          <div className="mt-2">{renderCurrencyBreakdown(summary.incomeByCurrency)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-500" />
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Expenses</p>
          </div>
          <div className="mt-2">{renderCurrencyBreakdown(summary.expenseByCurrency)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-500" />
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Net change</p>
          </div>
          <div className="mt-2">{renderCurrencyBreakdown(summary.netByCurrency)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" />
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Entries</p>
          </div>
          <p className="mt-2 font-mono font-semibold text-lg tabular-nums">{totalEntries}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Adjustments and transfers are excluded from the summary totals above.
          </p>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-xs md:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-1">
          <label htmlFor="transactions-account" className="text-muted-foreground text-xs uppercase tracking-wide">
            Account
          </label>
          <Select
            value={search.accountId ?? "__all__"}
            onValueChange={(value) => patchSearch({ accountId: value === "__all__" ? undefined : value })}
          >
            <SelectTrigger id="transactions-account" className="w-full">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All accounts</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.labelText || "Untitled"} ({account.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="transactions-time-range" className="text-muted-foreground text-xs uppercase tracking-wide">
            Time range
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button id="transactions-time-range" variant="outline" className="w-full justify-start px-3 font-normal">
                <CalendarIcon className="size-4 text-muted-foreground" />
                <span className="truncate">{formatTimeRangeLabel(search.from, search.to)}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <div className="flex flex-col gap-3 p-3">
                <div className="flex flex-wrap gap-2">
                  {TIME_RANGE_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => patchSearch(preset.getRange())}
                    >
                      {preset.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => patchSearch({ from: undefined, to: undefined })}
                  >
                    Clear
                  </Button>
                </div>
                <Calendar
                  mode="range"
                  numberOfMonths={isDesktop ? 2 : 1}
                  selected={{
                    from: search.from ? new Date(search.from) : undefined,
                    to: search.to ? new Date(search.to) : undefined,
                  }}
                  onSelect={(range) =>
                    patchSearch({
                      from: range?.from ? startOfDay(range.from).getTime() : undefined,
                      to: range?.to ? endOfDay(range.to).getTime() : undefined,
                    })
                  }
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <label htmlFor="transactions-sort" className="text-muted-foreground text-xs uppercase tracking-wide">
            Sort
          </label>
          <Select value={sort} onValueChange={(value) => patchSearch({ sort: value as TransactionSort })}>
            <SelectTrigger id="transactions-sort" className="w-full">
              <SelectValue placeholder="Sort transactions" />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_SORTS.map((sortOption) => (
                <SelectItem key={sortOption} value={sortOption}>
                  {SORT_LABELS[sortOption]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="transactions-type" className="text-muted-foreground text-xs uppercase tracking-wide">
            Type
          </label>
          <Select
            value={search.type ?? "__all__"}
            onValueChange={(value) =>
              patchSearch({ type: value === "__all__" ? undefined : (value as TransactionType) })
            }
          >
            <SelectTrigger id="transactions-type" className="w-full">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              {TRANSACTION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="transactions-category" className="text-muted-foreground text-xs uppercase tracking-wide">
            Category
          </label>
          <ComboboxInput
            id="transactions-category"
            value={search.category ?? ""}
            onChange={(value) => patchSearch({ category: value })}
            options={categories}
            placeholder="Filter category"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="transactions-search" className="text-muted-foreground text-xs uppercase tracking-wide">
            Search
          </label>
          <Input
            id="transactions-search"
            value={search.q ?? ""}
            onChange={(event) => patchSearch({ q: event.currentTarget.value })}
            placeholder="Title, notes, category"
          />
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <Landmark className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No transactions match this view.</p>
            <p className="text-muted-foreground text-sm">Create an entry or relax the current filters.</p>
          </div>
          <Button onClick={createExpense} variant="outline">
            <PlusIcon className="size-4" />
            New expense
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
          <div className="divide-y">
            {visibleTransactions.map((transaction) => {
              const primaryAccount = accountMap.get(transaction.accountId);
              const secondaryAccount = transaction.counterpartyAccountId
                ? accountMap.get(transaction.counterpartyAccountId)
                : undefined;
              const display = getDisplayAmountForAccount(transaction, search.accountId);
              const isTransfer = transaction.type === "transfer";
              const typeStyle = TYPE_STYLE[transaction.type as TransactionType] ?? TYPE_STYLE.expense;
              const title =
                transaction.title ||
                (transaction.type === "expense"
                  ? "Expense"
                  : transaction.type === "income"
                    ? "Income"
                    : transaction.type === "adjustment"
                      ? "Adjustment"
                      : "Transfer");

              return (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={
                    isContextKeyHeld
                      ? getAttachClickHandler({ table: "transaction_entry", id: transaction.id })
                      : () => openEdit(transaction.id)
                  }
                  className={cn(
                    "flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center",
                    isContextKeyHeld && "cursor-copy",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{title}</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px] uppercase tracking-wide",
                          typeStyle.badge,
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", typeStyle.dot)} />
                        {transaction.type}
                      </span>
                      {transaction.category ? (
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {transaction.category}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
                      <span>{formatDateTimeDisplay(transaction.effectiveAt)}</span>
                      <span>
                        {primaryAccount?.labelText || "Untitled"}
                        {isTransfer && secondaryAccount ? ` \u2192 ${secondaryAccount.labelText || "Untitled"}` : null}
                      </span>
                    </div>

                    {transaction.notes ? (
                      <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{transaction.notes}</p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    {isTransfer && !search.accountId ? (
                      <div className="space-y-1">
                        <p className="font-medium font-mono tabular-nums">
                          {formatBalance(transaction.amount, transaction.accountCurrency)}
                        </p>
                        {transaction.counterpartyAmount !== null ? (
                          <p className="font-mono text-muted-foreground text-sm tabular-nums">
                            {formatBalance(transaction.counterpartyAmount, transaction.counterpartyCurrency)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className={cn("font-medium font-mono tabular-nums", summaryAmountClass(display.amount))}>
                        {formatBalance(display.amount, display.currency)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {hasMore ? (
            <div className="border-t p-3 text-center">
              <Button onClick={() => setLimit((current) => current + DEFAULT_LIMIT)} variant="outline" size="sm">
                Load more
              </Button>
              <p className="mt-2 text-muted-foreground text-xs">
                Showing {visibleTransactions.length} of {totalEntries}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
