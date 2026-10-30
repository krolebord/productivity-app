import {
  inlineTransactionRecord,
  type TransactionsSpec,
  TransactionsSpecSchema,
} from "@productivity/core/agent/transactions-spec";
import { useAccountLabels } from "@productivity/core/data/accounts";
import { useTransactionsByIds } from "@productivity/core/data/transactions";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useDisplayCurrency } from "../../lib/finance";
import { cn } from "../../lib/utils";
import { TransactionRow } from "../transaction-row";
import { Icon } from "../ui/icon";
import { ToolErrorChip } from "./tool-chip";

const EMPTY_LABELS: ReadonlyMap<string, string> = new Map();

function TransactionsList({ spec }: { spec: TransactionsSpec }) {
  const router = useRouter();
  const { baseCurrency, convert } = useDisplayCurrency();
  const refIds = spec.items.flatMap((item) => (item.kind === "ref" ? [item.id] : []));
  const transactions = useTransactionsByIds(refIds);
  const accounts = useAccountLabels();
  const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const accountLabels = new Map(accounts.map((account) => [account.id, account.labelText]));
  const hasInline = spec.items.some((item) => item.kind === "inline");
  const now = Date.now();

  return (
    <View className="w-full overflow-hidden rounded-xl border border-border bg-card">
      {(spec.title || spec.description) && (
        <View className="border-border border-b px-4 py-2.5">
          {spec.title && <Text className="font-medium text-foreground text-sm">{spec.title}</Text>}
          {spec.description && <Text className="text-muted-foreground text-xs">{spec.description}</Text>}
        </View>
      )}
      {spec.items.map((item, index) => {
        const last = index === spec.items.length - 1;
        if (item.kind === "ref") {
          const transaction = transactionsById.get(item.id);
          if (!transaction) {
            return (
              <View
                key={`ref-${index}-${item.id}`}
                className={cn("flex-row items-center gap-2 px-4 py-2.5", !last && "border-border border-b")}
              >
                <Icon name="alert-circle" size={14} colorClassName="accent-destructive" />
                <Text numberOfLines={1} className="min-w-0 flex-1 text-muted-foreground text-xs">
                  Transaction not found ({item.id})
                </Text>
              </View>
            );
          }
          return (
            <TransactionRow
              key={`ref-${index}-${item.id}`}
              transaction={transaction}
              accountLabels={accountLabels}
              baseCurrency={baseCurrency}
              convert={convert}
              onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: transaction.id } })}
              last={last}
            />
          );
        }
        return (
          // Dashed left rule marks an agent-authored row that isn't in the ledger.
          <View key={`inline-${index}`} className="border-muted-foreground/40 border-l-2 border-dashed">
            <TransactionRow
              transaction={inlineTransactionRecord(item, now)}
              accountLabels={EMPTY_LABELS}
              accountFallback={item.accountLabel ?? ""}
              baseCurrency={baseCurrency}
              convert={convert}
              last={last}
            />
          </View>
        );
      })}
      {hasInline && (
        <Text className="border-border border-t px-4 py-1.5 text-muted-foreground text-xs">
          Dashed rows are examples, not saved transactions.
        </Text>
      )}
    </View>
  );
}

/** The agent's `renderTransactions` output: ledger rows open the editor, inline ones are examples. */
export function TransactionsCard({ spec: rawSpec }: { spec: unknown }) {
  const parsed = TransactionsSpecSchema.safeParse(rawSpec);
  if (!parsed.success) return <ToolErrorChip label="Could not render transactions" />;
  return <TransactionsList spec={parsed.data} />;
}
