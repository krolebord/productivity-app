import { formatBalance } from "@productivity/core/currency/format";
import { useAccounts } from "@productivity/core/data/accounts";
import {
  IMPORTANCE_FILTERS,
  TRANSACTION_SORTS,
  type TransactionSort,
  useTransactionCategories,
  useTransactionCount,
  useTransactionPage,
} from "@productivity/core/data/transactions";
import type { AmountConverter } from "@productivity/core/finance/overview";
import {
  formatDayHeader,
  formatTimeRangeLabel,
  groupTransactionsByDay,
  TIME_RANGE_PRESETS,
  TRANSACTION_FILTER_KEYS,
  TRANSACTION_SORT_LABELS,
  type TransactionFilterKey,
} from "@productivity/core/finance/transaction-list";
import {
  getDisplayAmountForAccount,
  IMPORTANCE_TIERS,
  TRANSACTION_TYPES,
  type TransactionType,
} from "@productivity/core/transactions";
import { useDebounceCallback } from "@productivity/core/use-debounced-callback";
import type { AccountItem } from "@productivity/core/user-db/migrations";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { endOfDay, startOfDay } from "date-fns";
import {
  ArrowUpDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  Landmark,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAccountDialogStore } from "@/components/account-dialog";
import { AccountDot, AccountVisibilityToggle } from "@/components/account-row";
import { CategoryImportancePrompt } from "@/components/category-importance-prompt";
import { EmptyState, PageToolbar, SectionCard } from "@/components/page-shell";
import { useCreateExpense, useTransactionDialogStore } from "@/components/transaction-dialog";
import { TransactionRow } from "@/components/transaction-row";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDisplayCurrency } from "@/lib/finance/display-currency";
import { IMPORTANCE_STYLE } from "@/lib/finance-ui";
import { useAttachToAssistant } from "@/lib/use-attach-to-assistant";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const transactionsSearchSchema = z.object({
  accountId: z.string().optional(),
  category: z.string().optional(),
  currency: z.string().optional(),
  from: z.coerce.number().finite().optional(),
  importance: z.enum(IMPORTANCE_FILTERS).optional(),
  q: z.string().optional(),
  sort: z.enum(TRANSACTION_SORTS).optional(),
  to: z.coerce.number().finite().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
});

type TransactionsSearch = z.infer<typeof transactionsSearchSchema>;

const DEFAULT_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 250;

export const Route = createFileRoute("/_app/finances/transactions")({
  component: TransactionsPage,
  validateSearch: transactionsSearchSchema,
});

type FilterKey = TransactionFilterKey;

const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);

function FilterOptionList({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex max-h-72 w-52 flex-col overflow-auto p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
            selected === option.value && "bg-muted font-medium",
          )}
        >
          <CheckIcon className={cn("size-3.5 shrink-0", selected === option.value ? "opacity-100" : "opacity-0")} />
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function TransactionsTotal({ search, loaded }: { search: TransactionsSearch; loaded: number }) {
  const total = useTransactionCount(search);

  return (
    <p className="mt-2 text-muted-foreground text-xs">
      Showing {loaded} of {total}
    </p>
  );
}

/**
 * The account header for a filtered ledger. Doubles as the account's own card:
 * clicking it edits the account, so there is no separate accounts page to visit
 * for that.
 */
function SelectedAccountCard({
  account,
  baseCurrency,
  convert,
}: {
  account: AccountItem;
  baseCurrency: string;
  convert: AmountConverter;
}) {
  const openAccountDialog = useAccountDialogStore((state) => state.openEdit);
  const converted = account.currency === baseCurrency ? null : convert(Number(account.balance), account.currency);

  return (
    <div className="group flex items-start gap-2 rounded-lg border bg-card shadow-xs">
      <button
        type="button"
        aria-label={`Edit ${account.labelText || "untitled account"}`}
        onClick={() => openAccountDialog(account.id)}
        className="min-w-0 flex-1 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <AccountDot color={account.labelColor} className="size-3" />
          <span className="truncate font-medium text-sm">{account.labelText || "Untitled account"}</span>
          <span className="shrink-0 text-muted-foreground text-xs">{account.currency}</span>
          {/* Always visible: on touch there is no hover to reveal that the card edits. */}
          <PencilIcon className="size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
        </span>
        <span className="mt-0.5 block font-mono font-semibold text-base tabular-nums">
          {formatBalance(account.balance, account.currency)}
        </span>
        {converted === null ? null : (
          <span className="block font-mono text-muted-foreground text-xs tabular-nums">
            ≈ {formatBalance(converted, baseCurrency)}
          </span>
        )}
        {account.description ? (
          <span className="mt-1 line-clamp-2 block text-muted-foreground text-sm">{account.description}</span>
        ) : null}
      </button>
      <AccountVisibilityToggle account={account} className="mt-2 mr-2" />
    </div>
  );
}

function TransactionsPage() {
  const search = Route.useSearch();
  const sort = search.sort ?? "date_desc";
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const openEdit = useTransactionDialogStore((state) => state.openEdit);
  const { isContextKeyHeld, getAttachClickHandler } = useAttachToAssistant();
  const createExpense = useCreateExpense(search.accountId ? { accountId: search.accountId } : undefined);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPage, setAddPage] = useState<FilterKey | null>(null);

  const searchQuery = search.q ?? "";
  const [searchInput, setSearchInput] = useState(searchQuery);
  const submittedQueryRef = useRef(searchQuery);

  const submitSearchQuery = useDebounceCallback((value: string) => {
    submittedQueryRef.current = value;
    patchSearch({ q: value });
  }, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (searchQuery === submittedQueryRef.current) {
      return;
    }

    // The URL changed from outside the input, so drop any write we still owe it.
    submittedQueryRef.current = searchQuery;
    submitSearchQuery.cancel();
    setSearchInput(searchQuery);
  }, [searchQuery, submitSearchQuery]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed on filter values, not setLimit.
  useEffect(() => {
    setLimit(DEFAULT_LIMIT);
  }, [
    search.accountId,
    search.type,
    search.category,
    search.currency,
    search.importance,
    search.from,
    search.q,
    search.sort,
    search.to,
  ]);

  const accounts = useAccounts();
  const currencyOptions = Array.from(new Set(accounts.map((account) => account.currency))).sort();

  // Same display currency the overview uses, so amounts read alike on both tabs.
  const { baseCurrency, convert } = useDisplayCurrency();

  const categories = useTransactionCategories();

  const { transactions: visibleTransactions, hasMore } = useTransactionPage(search, sort, limit);

  const dayGroups = groupTransactionsByDay(visibleTransactions, sort).map((group) => ({
    ...group,
    label: group.timestamp === null ? "" : formatDayHeader(group.timestamp),
  }));

  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const selectedAccount = search.accountId ? accountMap.get(search.accountId) : undefined;

  function patchSearch(next: Partial<typeof search>) {
    navigate({
      to: "/finances/transactions",
      replace: true,
      search: (prev) => {
        const merged = { ...prev, ...next };
        return {
          accountId: merged.accountId || undefined,
          category: merged.category || undefined,
          currency: merged.currency || undefined,
          from: merged.from || undefined,
          importance: merged.importance || undefined,
          q: merged.q || undefined,
          sort: merged.sort === "date_desc" ? undefined : merged.sort,
          to: merged.to || undefined,
          type: merged.type || undefined,
        };
      },
    });
  }

  function closeFilterPopovers() {
    setOpenFilter(null);
    setAddOpen(false);
    setAddPage(null);
  }

  const filterMeta: Record<FilterKey, { label: string; value: string | null }> = {
    account: {
      label: "Account",
      value: selectedAccount ? selectedAccount.labelText || "Untitled" : null,
    },
    currency: { label: "Currency", value: search.currency ?? null },
    time: {
      label: "Time range",
      value: search.from || search.to ? formatTimeRangeLabel(search.from, search.to) : null,
    },
    type: { label: "Type", value: search.type ? capitalize(search.type) : null },
    importance: {
      label: "Importance",
      value: search.importance
        ? search.importance === "none"
          ? "Unclassified"
          : IMPORTANCE_STYLE[search.importance].label
        : null,
    },
    category: { label: "Category", value: search.category || null },
  };

  function clearFilter(key: FilterKey) {
    switch (key) {
      case "account":
        return patchSearch({ accountId: undefined });
      case "currency":
        return patchSearch({ currency: undefined });
      case "time":
        return patchSearch({ from: undefined, to: undefined });
      case "type":
        return patchSearch({ type: undefined });
      case "importance":
        return patchSearch({ importance: undefined });
      case "category":
        return patchSearch({ category: undefined });
    }
  }

  function renderFilterEditor(key: FilterKey) {
    switch (key) {
      case "account":
        return (
          <FilterOptionList
            options={[
              { value: "", label: "All accounts" },
              ...accounts.map((account) => ({
                value: account.id,
                label: `${account.labelText || "Untitled"} (${account.currency})`,
              })),
            ]}
            selected={search.accountId ?? ""}
            onSelect={(value) => {
              patchSearch({ accountId: value || undefined });
              closeFilterPopovers();
            }}
          />
        );
      case "currency":
        return (
          <FilterOptionList
            options={[
              { value: "", label: "All currencies" },
              ...currencyOptions.map((currency) => ({ value: currency, label: currency })),
            ]}
            selected={search.currency ?? ""}
            onSelect={(value) => {
              patchSearch({ currency: value || undefined });
              closeFilterPopovers();
            }}
          />
        );
      case "type":
        return (
          <FilterOptionList
            options={[
              { value: "", label: "All types" },
              ...TRANSACTION_TYPES.map((type) => ({ value: type, label: capitalize(type) })),
            ]}
            selected={search.type ?? ""}
            onSelect={(value) => {
              patchSearch({ type: value ? (value as TransactionType) : undefined });
              closeFilterPopovers();
            }}
          />
        );
      case "importance":
        return (
          <FilterOptionList
            options={[
              { value: "", label: "All importance" },
              ...IMPORTANCE_TIERS.map((tier) => ({ value: tier, label: IMPORTANCE_STYLE[tier].label })),
              { value: "none", label: "Unclassified" },
            ]}
            selected={search.importance ?? ""}
            onSelect={(value) => {
              patchSearch({ importance: value ? (value as TransactionsSearch["importance"]) : undefined });
              closeFilterPopovers();
            }}
          />
        );
      case "category":
        return (
          <div className="w-64 p-2">
            <ComboboxInput
              value={search.category ?? ""}
              onChange={(value) => patchSearch({ category: value })}
              options={categories}
              placeholder="Filter category"
            />
          </div>
        );
      case "time":
        return (
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap gap-2">
              {TIME_RANGE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => patchSearch(preset.getRange(new Date()))}
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
        );
    }
  }

  const activeFilters = TRANSACTION_FILTER_KEYS.filter((key) => filterMeta[key].value !== null);
  const inactiveFilters = TRANSACTION_FILTER_KEYS.filter((key) => filterMeta[key].value === null);

  return (
    <div className="flex flex-col gap-6">
      <CategoryImportancePrompt />

      <PageToolbar>
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="transactions-search"
            value={searchInput}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSearchInput(value);
              submitSearchQuery(value);
            }}
            placeholder="Search title, notes, category"
            className="pl-9"
          />
        </div>

        <Select
          items={TRANSACTION_SORT_LABELS}
          value={sort}
          onValueChange={(value) => patchSearch({ sort: value as TransactionSort })}
        >
          <SelectTrigger id="transactions-sort" className="w-[11.5rem]">
            <ArrowUpDownIcon className="size-4 text-muted-foreground" />
            <SelectValue placeholder="Sort transactions" />
          </SelectTrigger>
          <SelectContent>
            {TRANSACTION_SORTS.map((sortOption) => (
              <SelectItem key={sortOption} value={sortOption}>
                {TRANSACTION_SORT_LABELS[sortOption]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="hidden h-6 w-px self-center bg-border sm:block" />

        {activeFilters.map((key) => (
          // The chip is two sibling buttons — edit and clear — so neither ends up
          // nested inside the other.
          <span
            key={key}
            className="inline-flex h-8 items-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-sm dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300"
          >
            <Popover open={openFilter === key} onOpenChange={(open) => setOpenFilter(open ? key : null)}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Edit ${filterMeta[key].label} filter`}
                    className="inline-flex h-full max-w-[14rem] items-center rounded-l-full pr-1.5 pl-3 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50"
                  />
                }
              >
                <span className="truncate">
                  {filterMeta[key].label}: <span className="font-semibold">{filterMeta[key].value}</span>
                </span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                {renderFilterEditor(key)}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              aria-label={`Clear ${filterMeta[key].label} filter`}
              className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-blue-200/70 dark:hover:bg-blue-800/70"
              onClick={() => clearFilter(key)}
            >
              <XIcon className="size-3.5" />
            </button>
          </span>
        ))}

        {inactiveFilters.length > 0 ? (
          <Popover
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) {
                setAddPage(null);
              }
            }}
          >
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              <PlusIcon className="size-3.5" />
              Add filter
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              {addPage === null ? (
                <div className="flex w-44 flex-col p-1">
                  {inactiveFilters.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAddPage(key)}
                      className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      {filterMeta[key].label}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setAddPage(null)}
                    className="flex w-full items-center gap-1.5 border-b px-3 py-2 text-left font-medium text-xs hover:bg-muted"
                  >
                    <ChevronLeftIcon className="size-3.5" />
                    {filterMeta[addPage].label}
                  </button>
                  {renderFilterEditor(addPage)}
                </div>
              )}
            </PopoverContent>
          </Popover>
        ) : null}

        {activeFilters.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              patchSearch({
                accountId: undefined,
                currency: undefined,
                from: undefined,
                to: undefined,
                type: undefined,
                importance: undefined,
                category: undefined,
              })
            }
            className="ml-1 text-muted-foreground text-sm underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </PageToolbar>

      {selectedAccount ? (
        <SelectedAccountCard account={selectedAccount} baseCurrency={baseCurrency} convert={convert} />
      ) : null}

      {visibleTransactions.length === 0 ? (
        <EmptyState
          icon={<Landmark className="size-8 text-muted-foreground" />}
          title="No transactions match this view."
          description="Create an entry or relax the current filters."
          action={
            <Button onClick={createExpense} variant="outline">
              <PlusIcon className="size-4" />
              New expense
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {dayGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              {group.label ? (
                <div className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {group.label}
                </div>
              ) : null}
              <SectionCard bodyClassName="divide-y">
                {group.transactions.map((transaction) => {
                  const primaryAccount = accountMap.get(transaction.accountId);
                  const secondaryAccount = transaction.counterpartyAccountId
                    ? accountMap.get(transaction.counterpartyAccountId)
                    : undefined;
                  const display = getDisplayAmountForAccount(transaction, search.accountId);
                  const converted =
                    display.currency === baseCurrency ? null : convert(display.amount, display.currency);

                  return (
                    <TransactionRow
                      key={transaction.id}
                      variant="detailed"
                      transaction={transaction}
                      primaryAccount={primaryAccount}
                      secondaryAccount={secondaryAccount}
                      displayAmount={display}
                      convertedAmount={converted === null ? undefined : { amount: converted, currency: baseCurrency }}
                      showTransferPair={!search.accountId}
                      isAttachMode={isContextKeyHeld}
                      onClick={
                        isContextKeyHeld
                          ? getAttachClickHandler({ table: "transaction_entry", id: transaction.id })
                          : () => openEdit(transaction.id)
                      }
                    />
                  );
                })}
              </SectionCard>
            </div>
          ))}

          {hasMore ? (
            <div className="p-3 text-center">
              <Button onClick={() => setLimit((current) => current + DEFAULT_LIMIT)} variant="outline" size="sm">
                Load more
              </Button>
              <TransactionsTotal search={search} loaded={visibleTransactions.length} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
