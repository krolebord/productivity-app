import { formatBalance } from "@productivity/core/currency/format";
import { formatDateTimeDisplay } from "@productivity/core/date-time";
import { resolveTransactionType, transactionTitle } from "@productivity/core/finance/appearance";
import { getDisplayAmountForAccount, type TransactionRow as TransactionRecord } from "@productivity/core/transactions";
import { Pressable, Text, View } from "react-native";
import { TRANSACTION_TYPE_STYLE } from "../lib/finance";
import { Icon } from "./ui/icon";

export function TransactionRow({
  transaction,
  accountLabels,
  focusAccountId,
  onPress,
  last = false,
}: {
  transaction: TransactionRecord;
  accountLabels: ReadonlyMap<string, string>;
  /** Shows the amount from this account's side, e.g. the incoming leg of a transfer. */
  focusAccountId?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const type = resolveTransactionType(transaction.type);
  const style = TRANSACTION_TYPE_STYLE[type];
  const display = getDisplayAmountForAccount(transaction, focusAccountId);
  const account = accountLabels.get(transaction.accountId) || "Untitled";
  const accountPart =
    type === "transfer"
      ? `${account} → ${accountLabels.get(transaction.counterpartyAccountId) || "Untitled"}`
      : account;
  const subtitle = [transaction.category, accountPart, formatDateTimeDisplay(transaction.effectiveAt)]
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-14 flex-row items-center gap-3 px-4 py-2.5 active:bg-muted ${last ? "" : "border-border border-b"}`}
    >
      <View className="size-8 items-center justify-center rounded-full bg-muted">
        <Icon name={style.icon} size={15} colorClassName={style.iconAccent} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-medium text-base text-foreground">
          {transactionTitle(transaction)}
        </Text>
        <Text numberOfLines={1} className="text-muted-foreground text-xs">
          {subtitle}
        </Text>
      </View>
      {/* Tinted by type like the web, so a transfer stays blue and a negative adjustment amber. */}
      <Text className={`font-medium text-base ${style.accent}`}>{formatBalance(display.amount, display.currency)}</Text>
    </Pressable>
  );
}
