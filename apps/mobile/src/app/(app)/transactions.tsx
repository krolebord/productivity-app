import { useAccountLabels } from "@productivity/core/data/accounts";
import { type TransactionFilters, useTransactionCount, useTransactionPage } from "@productivity/core/data/transactions";
import type { TransactionType } from "@productivity/core/transactions";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TransactionRow } from "../../components/transaction-row";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { Segmented } from "../../components/ui/segmented";

const PAGE_SIZE = 50;

const TYPE_FILTERS: readonly { value: TransactionType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

export default function TransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TransactionType | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const labels = useAccountLabels();
  const accountLabels = useMemo(() => new Map(labels.map((a) => [a.id, a.labelText])), [labels]);
  const filters: TransactionFilters = {
    accountId: accountId || undefined,
    q: query.trim() || undefined,
    type: type === "all" ? undefined : type,
  };
  const { transactions, hasMore } = useTransactionPage(filters, "date_desc", limit);
  const count = useTransactionCount(filters);
  const title = accountId ? accountLabels.get(accountId) || "Account" : "Transactions";

  return (
    <View className="flex-1 bg-background">
      <View className="gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 4 }}>
        <View className="flex-row items-center gap-1">
          <IconButton icon="chevron-left" label="Back" onPress={() => router.back()} size={24} />
          <View className="flex-1">
            <Text numberOfLines={1} className="font-semibold text-foreground text-xl">
              {title}
            </Text>
            <Text className="text-muted-foreground text-xs">
              {count} transaction{count === 1 ? "" : "s"}
            </Text>
          </View>
          <IconButton
            icon="plus"
            label="New transaction"
            onPress={() =>
              router.push({ pathname: "/transaction/[id]", params: { id: "new", accountId: accountId ?? "" } })
            }
          />
        </View>
        <View className="h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
          <Icon name="search" size={16} colorClassName="accent-muted-foreground" />
          <Input
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Search title, category, notes"
            className="h-full flex-1"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Segmented
          options={TYPE_FILTERS}
          value={type}
          onChange={(next) => {
            setType(next);
            setLimit(PAGE_SIZE);
          }}
        />
      </View>
      <FlatList
        data={transactions}
        keyExtractor={(transaction) => transaction.id}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => hasMore && setLimit((value) => value + PAGE_SIZE)}
        renderItem={({ item }) => (
          <TransactionRow
            transaction={item}
            accountLabels={accountLabels}
            focusAccountId={accountId}
            onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={<EmptyState icon="list" title="No transactions" />}
      />
    </View>
  );
}
