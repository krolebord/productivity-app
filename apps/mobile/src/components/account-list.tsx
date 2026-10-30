import { formatBalance } from "@productivity/core/currency/format";
import { setAccountExcludedFromDashboard, useReorderableAccounts } from "@productivity/core/data/accounts";
import type { AmountConverter } from "@productivity/core/finance/overview";
import type { AccountRow } from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { Pressable, Text, View } from "react-native";
import { cn } from "../lib/utils";
import { type DragHandle, ReorderableList } from "./reorderable-list";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/icon-button";

/** Rows have a fixed height so a drag offset maps straight to a target slot. */
const ROW_HEIGHT = 60;

/**
 * The accounts card body: hold the grip to drag a row into a new slot, the eye toggles whether
 * the account counts toward the totals (hidden rows are dimmed), and a row opens that
 * account's transactions. The same list the web's accounts card shows.
 */
export function AccountList({
  baseCurrency,
  convert,
  onOpen,
  onDraggingChange,
}: {
  baseCurrency: string;
  convert: AmountConverter;
  onOpen: (accountId: string) => void;
  /** The screen's scroll view must stop scrolling while a row is dragged. */
  onDraggingChange: (dragging: boolean) => void;
}) {
  const db = useDb();
  const { accounts, moveAccount } = useReorderableAccounts();

  return (
    <ReorderableList
      items={accounts}
      rowHeight={ROW_HEIGHT}
      onMove={moveAccount}
      onDraggingChange={onDraggingChange}
      rowClassName="bg-card"
      renderItem={(account, handle, position) => (
        <AccountListRow
          account={account}
          handle={handle}
          converted={account.currency === baseCurrency ? null : convert(Number(account.balance), account.currency)}
          baseCurrency={baseCurrency}
          last={position === accounts.length - 1}
          onPress={() => onOpen(account.id)}
          onToggleHidden={() => setAccountExcludedFromDashboard(db.db, account.id, !account.excludeFromDashboard)}
        />
      )}
    />
  );
}

function AccountListRow({
  account,
  handle,
  converted,
  baseCurrency,
  last,
  onPress,
  onToggleHidden,
}: {
  account: AccountRow;
  handle: DragHandle;
  converted: number | null;
  baseCurrency: string;
  last: boolean;
  onPress: () => void;
  onToggleHidden: () => void;
}) {
  const hidden = !!account.excludeFromDashboard;
  const name = account.labelText || "Untitled";

  return (
    <View className={cn("h-full flex-row items-center", !last && "border-border border-b", hidden && "opacity-50")}>
      {handle(
        <View
          accessibilityLabel={`Reorder ${name}`}
          accessibilityHint="Hold and drag to move"
          className="h-full justify-center pr-1 pl-3"
        >
          <Icon name="menu" size={16} colorClassName="accent-muted-foreground/60" />
        </View>,
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name} transactions`}
        onPress={onPress}
        className="h-full min-w-0 flex-1 flex-row items-center gap-3 pr-1 pl-1 active:opacity-60"
      >
        <View className="size-2.5 rounded-full" style={{ backgroundColor: account.labelColor }} />
        <Text numberOfLines={1} className="min-w-0 flex-1 text-base text-foreground">
          {name}
        </Text>
        <View className="items-end">
          <Text className="font-medium text-base text-foreground">
            {formatBalance(Number(account.balance), account.currency)}
          </Text>
          {converted !== null && (
            <Text className="text-muted-foreground text-xs">≈ {formatBalance(converted, baseCurrency)}</Text>
          )}
        </View>
      </Pressable>
      <IconButton
        icon={hidden ? "eye" : "eye-off"}
        label={hidden ? `Show ${name} in totals` : `Hide ${name} from totals`}
        onPress={onToggleHidden}
        size={16}
        iconClassName="accent-muted-foreground"
        className="mr-1"
      />
    </View>
  );
}
