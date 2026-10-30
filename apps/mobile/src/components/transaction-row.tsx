import { formatBalance } from "@productivity/core/currency/format";
import { formatDateTimeDisplay } from "@productivity/core/date-time";
import { resolveTransactionType, transactionTitle } from "@productivity/core/finance/appearance";
import type { AmountConverter } from "@productivity/core/finance/overview";
import {
  getDisplayAmountForAccount,
  type ImportanceTier,
  type TransactionRow as TransactionRecord,
} from "@productivity/core/transactions";
import { format } from "date-fns";
import { Pressable, Text, View } from "react-native";
import { IMPORTANCE_STYLE, TRANSACTION_TYPE_STYLE } from "../lib/finance";
import { cn } from "../lib/utils";
import { Icon } from "./ui/icon";

/** The amount in the display currency, or null when it's already in it (or has no rate). */
function convertedAmount(amount: number, currency: string, baseCurrency?: string, convert?: AmountConverter) {
  if (!baseCurrency || !convert || currency === baseCurrency) return null;
  const converted = convert(amount, currency);
  return converted === null ? null : formatBalance(converted, baseCurrency);
}

export function TransactionRow({
  transaction,
  accountLabels,
  focusAccountId,
  baseCurrency,
  convert,
  variant = "compact",
  showTransferPair = false,
  timeOnly = false,
  onPress,
  last = false,
}: {
  transaction: TransactionRecord;
  accountLabels: ReadonlyMap<string, string>;
  /** Shows the amount from this account's side, e.g. the incoming leg of a transfer. */
  focusAccountId?: string;
  /** With `convert`, adds a "≈" line in the display currency under foreign amounts, as on the web. */
  baseCurrency?: string;
  convert?: AmountConverter;
  /** "detailed" is the ledger row: category and importance badges, notes, both legs of a transfer. */
  variant?: "compact" | "detailed";
  /** Shows both legs of a transfer instead of one side's amount (ledger without an account filter). */
  showTransferPair?: boolean;
  /** Under a day header the date is redundant, so only the time is shown. */
  timeOnly?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const type = resolveTransactionType(transaction.type);
  const style = TRANSACTION_TYPE_STYLE[type];
  const display = getDisplayAmountForAccount(transaction, focusAccountId);
  const converted = convertedAmount(display.amount, display.currency, baseCurrency, convert);
  const account = accountLabels.get(transaction.accountId) || "Untitled";
  const isTransfer = type === "transfer";
  const accountPart = isTransfer
    ? `${account} → ${accountLabels.get(transaction.counterpartyAccountId) || "Untitled"}`
    : account;
  const when = timeOnly ? format(transaction.effectiveAt, "HH:mm") : formatDateTimeDisplay(transaction.effectiveAt);
  const importance = transaction.importance as ImportanceTier | null;
  const detailed = variant === "detailed";
  const pair = detailed && isTransfer && showTransferPair && transaction.counterpartyAmount !== null;

  const subtitle = (detailed ? [when, accountPart] : [transaction.category, accountPart, when])
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        "min-h-14 flex-row gap-3 px-4 py-2.5 active:bg-muted",
        detailed ? "items-start py-3" : "items-center",
        !last && "border-border border-b",
      )}
    >
      <View className="size-8 items-center justify-center rounded-full bg-muted">
        <Icon name={style.icon} size={15} colorClassName={style.iconAccent} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-medium text-base text-foreground">
          {transactionTitle(transaction)}
        </Text>
        {detailed && (transaction.category || importance) ? (
          <View className="mt-1 flex-row flex-wrap gap-1.5">
            {transaction.category ? (
              <View className="rounded-full border border-border px-2 py-0.5">
                <Text numberOfLines={1} className="text-[11px] text-muted-foreground">
                  {transaction.category}
                </Text>
              </View>
            ) : null}
            {importance && IMPORTANCE_STYLE[importance] ? (
              <View className={cn("rounded-full px-2 py-0.5", IMPORTANCE_STYLE[importance].badge)}>
                <Text className={cn("font-medium text-[11px]", IMPORTANCE_STYLE[importance].badgeText)}>
                  {IMPORTANCE_STYLE[importance].label}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", detailed && "mt-1")}>
          {subtitle}
        </Text>
        {detailed && transaction.notes ? (
          <Text numberOfLines={2} className="mt-1 text-muted-foreground text-sm">
            {transaction.notes}
          </Text>
        ) : null}
      </View>
      {/* Tinted by type like the web, so a transfer stays blue and a negative adjustment amber. */}
      <View className="items-end">
        {pair ? (
          <>
            <Text className={`font-medium text-base ${style.accent}`}>
              {formatBalance(transaction.amount, transaction.accountCurrency)}
            </Text>
            <Text className="mt-0.5 text-muted-foreground text-sm">
              {formatBalance(Number(transaction.counterpartyAmount), transaction.counterpartyCurrency)}
            </Text>
          </>
        ) : (
          <>
            <Text className={`font-medium text-base ${style.accent}`}>
              {formatBalance(display.amount, display.currency)}
            </Text>
            {converted && <Text className="text-muted-foreground text-xs">≈ {converted}</Text>}
          </>
        )}
      </View>
    </Pressable>
  );
}
