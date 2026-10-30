import { formatBalance } from "@productivity/core/currency/format";
import { setAccountExcludedFromDashboard, useReorderableAccounts } from "@productivity/core/data/accounts";
import type { AmountConverter } from "@productivity/core/finance/overview";
import type { AccountRow } from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useLayoutEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { cn } from "../lib/utils";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/icon-button";

/** Rows have a fixed height so a drag offset maps straight to a target slot. */
const ROW_HEIGHT = 60;

type DragState = { index: SharedValue<number>; offset: SharedValue<number>; count: number };

function targetIndex(from: number, offset: number, count: number) {
  "worklet";
  return Math.min(count - 1, Math.max(0, Math.round(from + offset / ROW_HEIGHT)));
}

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
  const index = useSharedValue(-1);
  const offset = useSharedValue(0);
  const drag: DragState = { index, offset, count: accounts.length };

  const orderKey = accounts.map((account) => account.id).join("|");
  // Release the dragged row only once the reordered list has rendered, so it doesn't flash
  // back to its old slot for a frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: orderKey is the trigger; shared values are stable.
  useLayoutEffect(() => {
    index.value = -1;
    offset.value = 0;
  }, [orderKey]);

  const drop = (from: number, to: number) => {
    onDraggingChange(false);
    if (from === to) {
      index.value = -1;
      offset.value = 0;
      return;
    }
    moveAccount(from, to);
  };

  return (
    <View style={{ height: accounts.length * ROW_HEIGHT }}>
      {accounts.map((account, position) => (
        <AccountListRow
          key={account.id}
          account={account}
          position={position}
          drag={drag}
          converted={account.currency === baseCurrency ? null : convert(Number(account.balance), account.currency)}
          baseCurrency={baseCurrency}
          last={position === accounts.length - 1}
          onPress={() => onOpen(account.id)}
          onToggleHidden={() => setAccountExcludedFromDashboard(db.db, account.id, !account.excludeFromDashboard)}
          onDragStart={() => onDraggingChange(true)}
          onDrop={drop}
        />
      ))}
    </View>
  );
}

function AccountListRow({
  account,
  position,
  drag,
  converted,
  baseCurrency,
  last,
  onPress,
  onToggleHidden,
  onDragStart,
  onDrop,
}: {
  account: AccountRow;
  position: number;
  drag: DragState;
  converted: number | null;
  baseCurrency: string;
  last: boolean;
  onPress: () => void;
  onToggleHidden: () => void;
  onDragStart: () => void;
  onDrop: (from: number, to: number) => void;
}) {
  const { index, offset, count } = drag;
  const hidden = !!account.excludeFromDashboard;
  const name = account.labelText || "Untitled";

  const pan = usePanGesture({
    activateAfterLongPress: 150,
    onActivate: () => {
      "worklet";
      index.value = position;
      offset.value = 0;
      scheduleOnRN(onDragStart);
    },
    onUpdate: (event) => {
      "worklet";
      offset.value = event.translationY;
    },
    onDeactivate: (event) => {
      "worklet";
      // A canceled drag (e.g. the system took the touch) springs back without saving.
      const to = event.canceled ? position : targetIndex(position, offset.value, count);
      // Settle on the target slot; the reorder lands once the row is there, and only if it got there.
      offset.value = withTiming((to - position) * ROW_HEIGHT, { duration: 120 }, (finished) =>
        scheduleOnRN(onDrop, position, finished ? to : position),
      );
    },
  });

  const style = useAnimatedStyle(() => {
    const from = index.value;
    if (from < 0) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, shadowOpacity: 0 };
    if (from === position) {
      return { transform: [{ translateY: offset.value }, { scale: 1.02 }], zIndex: 10, shadowOpacity: 0.15 };
    }
    // Rows between the dragged row's slot and its target make room for it.
    const to = targetIndex(from, offset.value, count);
    const shift = from < position && position <= to ? -ROW_HEIGHT : to <= position && position < from ? ROW_HEIGHT : 0;
    return {
      transform: [{ translateY: withTiming(shift, { duration: 150 }) }, { scale: 1 }],
      zIndex: 0,
      shadowOpacity: 0,
    };
  });

  return (
    <Animated.View
      className="absolute right-0 left-0 bg-card"
      style={[{ top: position * ROW_HEIGHT, height: ROW_HEIGHT, shadowColor: "#000", shadowRadius: 8 }, style]}
    >
      <View className={cn("h-full flex-row items-center", !last && "border-border border-b", hidden && "opacity-50")}>
        <GestureDetector gesture={pan}>
          <View
            accessibilityLabel={`Reorder ${name}`}
            accessibilityHint="Hold and drag to move"
            className="h-full justify-center pr-1 pl-3"
          >
            <Icon name="menu" size={16} colorClassName="accent-muted-foreground/60" />
          </View>
        </GestureDetector>
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
    </Animated.View>
  );
}
