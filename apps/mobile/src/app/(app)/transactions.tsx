import { sortCurrencies } from "@productivity/core/currency/currencies";
import { formatBalance } from "@productivity/core/currency/format";
import { setAccountExcludedFromDashboard, useAccounts } from "@productivity/core/data/accounts";
import {
  TRANSACTION_SORTS,
  type TransactionFilters,
  type TransactionSort,
  useTransactionCategories,
  useTransactionCount,
  useTransactionCurrencies,
  useTransactionPage,
  useUnclassifiedExpenseCount,
} from "@productivity/core/data/transactions";
import { IMPORTANCE_PROMPT_THRESHOLD } from "@productivity/core/finance/category-importance";
import type { AmountConverter } from "@productivity/core/finance/overview";
import {
  activeTransactionFilters,
  clearTransactionFilter,
  formatShortDayHeader,
  groupTransactionsByDay,
  TRANSACTION_SORT_LABELS,
} from "@productivity/core/finance/transaction-list";
import type { AccountRow } from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/screen-header";
import { TransactionFiltersSheet } from "../../components/transaction-filters-sheet";
import { TransactionRow } from "../../components/transaction-row";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon, type IconName } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { SelectSheet } from "../../components/ui/select-sheet";
import { useDisplayCurrency } from "../../lib/finance";
import { cn } from "../../lib/utils";

const PAGE_SIZE = 50;

const SORT_OPTIONS = TRANSACTION_SORTS.map((sort) => ({ value: sort, label: TRANSACTION_SORT_LABELS[sort] }));

function numberParam(value: string | undefined) {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : undefined;
}

export default function TransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // An account row opens its ledger; the overview's "View all" carries its period in.
  const params = useLocalSearchParams<{ accountId?: string; from?: string; to?: string }>();
  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    accountId: params.accountId || undefined,
    from: numberParam(params.from),
    to: numberParam(params.to),
  }));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TransactionSort>("date_desc");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const accounts = useAccounts();
  const categories = useTransactionCategories();
  const { baseCurrency, convert } = useDisplayCurrency();
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const accountLabels = useMemo(() => new Map(accounts.map((a) => [a.id, a.labelText])), [accounts]);
  const transactionCurrencies = useTransactionCurrencies();
  // Transactions keep the currency they were made in, so a currency no account uses anymore
  // can still be filtered on.
  const currencies = useMemo(
    () =>
      sortCurrencies([...new Set([...transactionCurrencies, ...accounts.map((account) => account.currency)])].sort()),
    [transactionCurrencies, accounts],
  );
  const selectedAccount = filters.accountId ? accountMap.get(filters.accountId) : undefined;

  // Deleting the account from its own ledger (via the edit sheet) drops the filter rather than
  // leaving an empty "Untitled" ledger behind.
  const sawAccount = useRef(false);
  useEffect(() => {
    if (selectedAccount) sawAccount.current = true;
    else if (sawAccount.current && filters.accountId) {
      sawAccount.current = false;
      setFilters((current) => ({ ...current, accountId: undefined }));
    }
  }, [selectedAccount, filters.accountId]);

  const queryFilters: TransactionFilters = { ...filters, q: query.trim() || undefined };
  const { transactions, hasMore } = useTransactionPage(queryFilters, sort, limit);
  const count = useTransactionCount(queryFilters);
  const chips = activeTransactionFilters(filters, selectedAccount?.labelText);

  const groups = groupTransactionsByDay(transactions, sort);
  const sections = groups.map((group) => ({
    key: group.key,
    title: group.timestamp === null ? "" : formatShortDayHeader(group.timestamp),
    data: group.transactions,
  }));
  const grouped = sort === "date_desc" || sort === "date_asc";

  // Every filter change starts over at the first page, as the web does.
  const changeFilters = (next: TransactionFilters) => {
    setFilters(next);
    setLimit(PAGE_SIZE);
  };
  const newExpense = () =>
    router.push({ pathname: "/transaction/[id]", params: { id: "new", accountId: filters.accountId ?? "" } });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={selectedAccount ? selectedAccount.labelText || "Untitled" : "Transactions"}
        subtitle={`${count} transaction${count === 1 ? "" : "s"}`}
        onBack={router.back}
        actions={
          <>
            {/* Always reachable, like the web's command palette entry; the prompt below only nudges. */}
            <IconButton icon="tag" label="Category importance" onPress={() => router.push("/category-importance")} />
            <IconButton icon="plus" label="New transaction" onPress={newExpense} />
          </>
        }
      >
        <View className="h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
          <Icon name="search" size={16} colorClassName="accent-muted-foreground" />
          <Input
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Search title, notes, category"
            className="h-full flex-1"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5">
          <View className="flex-row items-center gap-2 px-5">
            <ToolbarChip icon="sliders" label="Filters" count={chips.length} onPress={() => setFiltersOpen(true)} />
            <ToolbarChip
              icon={sort.endsWith("asc") ? "arrow-up" : "arrow-down"}
              label={TRANSACTION_SORT_LABELS[sort]}
              onPress={() => setSortOpen(true)}
            />
            {chips.map((chip) => (
              <FilterChip
                key={chip.key}
                label={chip.label}
                value={chip.value}
                onPress={() => setFiltersOpen(true)}
                onClear={() => changeFilters(clearTransactionFilter(filters, chip.key))}
              />
            ))}
            {chips.length > 0 && (
              <Pressable accessibilityRole="button" onPress={() => changeFilters({})} hitSlop={8} className="px-1">
                <Text className="text-muted-foreground text-sm">Clear all</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </ScreenHeader>

      <SectionList
        sections={sections}
        keyExtractor={(transaction) => transaction.id}
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => hasMore && setLimit((value) => value + PAGE_SIZE)}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <CategoryImportancePrompt onPress={() => router.push("/category-importance")} />
            {selectedAccount && (
              <AccountHeaderCard
                account={selectedAccount}
                baseCurrency={baseCurrency}
                convert={convert}
                onEdit={() => router.push({ pathname: "/account/[id]", params: { id: selectedAccount.id } })}
              />
            )}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text className="px-1 pt-4 pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {section.title}
            </Text>
          ) : (
            <View className="h-3" />
          )
        }
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View
              className={cn(
                "overflow-hidden border-border border-x bg-card",
                first && "rounded-t-xl border-t",
                last && "rounded-b-xl border-b",
              )}
            >
              <TransactionRow
                variant="detailed"
                transaction={item}
                accountLabels={accountLabels}
                focusAccountId={filters.accountId}
                baseCurrency={baseCurrency}
                convert={convert}
                showTransferPair={!filters.accountId}
                timeOnly={grouped}
                last={last}
                onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: item.id } })}
              />
            </View>
          );
        }}
        ListFooterComponent={
          hasMore ? (
            <Text className="py-4 text-center text-muted-foreground text-xs">
              Showing {transactions.length} of {count}
            </Text>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState
            icon="list"
            title="No transactions match this view."
            description="Create an entry or relax the current filters."
          >
            <Pressable
              accessibilityRole="button"
              onPress={newExpense}
              className="mt-3 h-10 flex-row items-center gap-1.5 rounded-lg border border-border px-4 active:bg-muted"
            >
              <Icon name="plus" size={14} colorClassName="accent-foreground" />
              <Text className="font-medium text-foreground">New expense</Text>
            </Pressable>
          </EmptyState>
        }
      />

      <TransactionFiltersSheet
        visible={filtersOpen}
        filters={filters}
        onChange={changeFilters}
        onClose={() => setFiltersOpen(false)}
        accounts={accounts}
        currencies={currencies}
        categories={categories}
      />
      <SelectSheet
        visible={sortOpen}
        title="Sort by"
        value={sort}
        options={SORT_OPTIONS}
        onClose={() => setSortOpen(false)}
        onSelect={(next) => {
          setSortOpen(false);
          setSort(next as TransactionSort);
          setLimit(PAGE_SIZE);
        }}
      />
    </View>
  );
}

function ToolbarChip({
  icon,
  label,
  count = 0,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count} active` : label}
      onPress={onPress}
      className="h-8 flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 active:bg-muted"
    >
      <Icon name={icon} size={14} colorClassName="accent-muted-foreground" />
      <Text className="text-foreground text-sm">{label}</Text>
      {count > 0 && (
        <View className="min-w-5 items-center rounded-full bg-primary px-1.5">
          <Text className="font-semibold text-primary-foreground text-xs">{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** An active filter, as the web's blue chips: the label edits, the cross clears it. */
function FilterChip({
  label,
  value,
  onPress,
  onClear,
}: {
  label: string;
  value: string;
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <View className="h-8 flex-row items-center rounded-full border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label} filter, ${value}`}
        onPress={onPress}
        className="h-full max-w-56 justify-center pr-1.5 pl-3"
      >
        <Text numberOfLines={1} className="text-blue-700 text-sm dark:text-blue-300">
          {label}: <Text className="font-semibold">{value}</Text>
        </Text>
      </Pressable>
      <IconButton
        icon="x"
        label={`Clear ${label} filter`}
        onPress={onClear}
        size={14}
        iconClassName="accent-blue-700 dark:accent-blue-300"
        className="mr-1 size-6"
      />
    </View>
  );
}

/** Nudges toward classifying categories once enough categorized expenses lack an importance. */
function CategoryImportancePrompt({ onPress }: { onPress: () => void }) {
  const missing = useUnclassifiedExpenseCount();
  if (missing <= IMPORTANCE_PROMPT_THRESHOLD) return null;

  return (
    <View className="mt-1 gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30">
      <View className="flex-row items-start gap-3">
        <Icon name="info" size={16} colorClassName="accent-blue-600 dark:accent-blue-300" />
        <View className="min-w-0 flex-1">
          <Text className="font-medium text-blue-900 text-sm dark:text-blue-100">
            Set importance for {missing} transactions
          </Text>
          <Text className="text-blue-800/80 text-sm dark:text-blue-100/75">
            Classify categories to improve spending breakdowns and cash-flow charts.
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="h-9 flex-row items-center justify-center gap-1.5 rounded-lg border border-blue-300 bg-white active:opacity-70 dark:border-blue-800 dark:bg-blue-950/60"
      >
        <Icon name="tag" size={14} colorClassName="accent-blue-900 dark:accent-blue-100" />
        <Text className="font-medium text-blue-900 text-sm dark:text-blue-100">Update importance</Text>
      </Pressable>
    </View>
  );
}

/**
 * The filtered account's own card, as on the web: tapping it edits the account, and the eye
 * toggles whether it counts toward the overview totals.
 */
function AccountHeaderCard({
  account,
  baseCurrency,
  convert,
  onEdit,
}: {
  account: AccountRow;
  baseCurrency: string;
  convert: AmountConverter;
  onEdit: () => void;
}) {
  const db = useDb();
  const hidden = !!account.excludeFromDashboard;
  const converted = account.currency === baseCurrency ? null : convert(Number(account.balance), account.currency);
  const name = account.labelText || "Untitled account";

  return (
    <View className="mt-1 flex-row items-start rounded-xl border border-border bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${name}`}
        onPress={onEdit}
        className="min-w-0 flex-1 px-4 py-3 active:opacity-60"
      >
        <View className="flex-row items-center gap-2">
          <View className="size-3 rounded-full" style={{ backgroundColor: account.labelColor }} />
          <Text numberOfLines={1} className="shrink font-medium text-foreground text-sm">
            {name}
          </Text>
          <Text className="text-muted-foreground text-xs">{account.currency}</Text>
          <Icon name="edit-2" size={12} colorClassName="accent-muted-foreground/60" />
        </View>
        <Text className="mt-1 font-semibold text-foreground text-xl">
          {formatBalance(Number(account.balance), account.currency)}
        </Text>
        {converted !== null && (
          <Text className="text-muted-foreground text-xs">≈ {formatBalance(converted, baseCurrency)}</Text>
        )}
        {hidden && <Text className="mt-1 text-muted-foreground text-xs">Hidden from totals</Text>}
        {account.description ? (
          <Text numberOfLines={2} className="mt-1 text-muted-foreground text-sm">
            {account.description}
          </Text>
        ) : null}
      </Pressable>
      <IconButton
        icon={hidden ? "eye" : "eye-off"}
        label={hidden ? "Show in totals" : "Hide from totals"}
        onPress={() => setAccountExcludedFromDashboard(db.db, account.id, !hidden)}
        size={16}
        iconClassName="accent-muted-foreground"
        className="mt-1.5 mr-1.5"
      />
    </View>
  );
}
