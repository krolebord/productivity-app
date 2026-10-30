import { type ReactElement, type ReactNode, useLayoutEffect } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { cn } from "../lib/utils";

type DragState = { index: SharedValue<number>; offset: SharedValue<number>; count: number; rowHeight: number };

function targetIndex(from: number, offset: number, count: number, rowHeight: number) {
  "worklet";
  return Math.min(count - 1, Math.max(0, Math.round(from + offset / rowHeight)));
}

/** Wraps the row's grip: hold it, then drag the row into a new slot. */
export type DragHandle = (grip: ReactElement) => ReactElement;

/**
 * A list whose rows are dragged into a new slot by a grip (see AccountList, the first user).
 * Rows have a fixed height so a drag offset maps straight to a target slot; `renderItem` gets
 * a `DragHandle` to wrap the row's grip in.
 */
export function ReorderableList<T extends { id: string }>({
  items,
  rowHeight,
  onMove,
  onDraggingChange,
  renderItem,
  rowClassName,
}: {
  items: readonly T[];
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  /** The screen's scroll view must stop scrolling while a row is dragged. */
  onDraggingChange: (dragging: boolean) => void;
  renderItem: (item: T, handle: DragHandle, position: number) => ReactNode;
  rowClassName?: string;
}) {
  const index = useSharedValue(-1);
  const offset = useSharedValue(0);
  const drag: DragState = { index, offset, count: items.length, rowHeight };

  const orderKey = items.map((item) => item.id).join("|");
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
    onMove(from, to);
  };

  return (
    <View style={{ height: items.length * rowHeight }}>
      {items.map((item, position) => (
        <ReorderableRow
          key={item.id}
          position={position}
          drag={drag}
          className={rowClassName}
          onDragStart={() => onDraggingChange(true)}
          onDrop={drop}
          render={(handle) => renderItem(item, handle, position)}
        />
      ))}
    </View>
  );
}

function ReorderableRow({
  position,
  drag,
  className,
  onDragStart,
  onDrop,
  render,
}: {
  position: number;
  drag: DragState;
  className?: string;
  onDragStart: () => void;
  onDrop: (from: number, to: number) => void;
  render: (handle: DragHandle) => ReactNode;
}) {
  const { index, offset, count, rowHeight } = drag;

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
      const to = event.canceled ? position : targetIndex(position, offset.value, count, rowHeight);
      // Settle on the target slot; the reorder lands once the row is there, and only if it got there.
      offset.value = withTiming((to - position) * rowHeight, { duration: 120 }, (finished) =>
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
    const to = targetIndex(from, offset.value, count, rowHeight);
    const shift = from < position && position <= to ? -rowHeight : to <= position && position < from ? rowHeight : 0;
    return {
      transform: [{ translateY: withTiming(shift, { duration: 150 }) }, { scale: 1 }],
      zIndex: 0,
      shadowOpacity: 0,
    };
  });

  const handle: DragHandle = (grip) => <GestureDetector gesture={pan}>{grip}</GestureDetector>;

  return (
    <Animated.View
      className={cn("absolute right-0 left-0", className)}
      style={[{ top: position * rowHeight, height: rowHeight, shadowColor: "#000", shadowRadius: 8 }, style]}
    >
      {render(handle)}
    </Animated.View>
  );
}
