import { type ReactElement, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { listItemExit, listLayoutTransition } from "../lib/list-transitions";
import { cn } from "../lib/utils";

type DragState = {
  index: SharedValue<number>;
  offset: SharedValue<number>;
  /** A shared value so a list growing or shrinking doesn't rebuild every row's gesture. */
  count: SharedValue<number>;
  rowHeight: number;
};

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
 *
 * Each row's gesture is reconfigured natively whenever its config changes. The React Compiler
 * memoizes the config, but only on its inputs, so those are kept stable: callbacks go through a
 * ref and `count` is a shared value. Only rows whose position changes get a new config.
 */
export function ReorderableList<T extends { id: string }>({
  items,
  rowHeight,
  onMove,
  onDraggingChange,
  renderItem,
  rowClassName,
  animateChanges = false,
}: {
  items: readonly T[];
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  /** The screen's scroll view must stop scrolling while a row is dragged. */
  onDraggingChange: (dragging: boolean) => void;
  renderItem: (item: T, handle: DragHandle, position: number) => ReactNode;
  rowClassName?: string;
  /** Animate insertions/removals; drag moves already animate through their shared offset. */
  animateChanges?: boolean;
}) {
  const index = useSharedValue(-1);
  const offset = useSharedValue(0);
  const count = useSharedValue(items.length);
  const drag: DragState = { index, offset, count, rowHeight };

  // `onMove` usually changes whenever the list does; the rows' gestures read the latest one
  // through this ref instead of closing over it.
  const callbacks = useRef({ onMove, onDraggingChange });
  useLayoutEffect(() => {
    callbacks.current = { onMove, onDraggingChange };
    count.set(items.length);
  });

  const orderKey = items.map((item) => item.id).join("|");
  const [membership, setMembership] = useState({ orderKey, changed: false });
  if (animateChanges && membership.orderKey !== orderKey) {
    const previous = new Set(membership.orderKey ? membership.orderKey.split("|") : []);
    setMembership({
      orderKey,
      changed: previous.size !== items.length || items.some((item) => !previous.has(item.id)),
    });
  }
  // A layout transition during a drag reorder would animate from the old slot a second time
  // after its drag offset resets. Only membership changes need this additional transition.
  const layout = animateChanges && membership.changed ? listLayoutTransition : undefined;
  // Release the dragged row only once the reordered list has rendered, so it doesn't flash
  // back to its old slot for a frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: orderKey is the trigger; shared values are stable.
  useLayoutEffect(() => {
    index.set(-1);
    offset.set(0);
  }, [orderKey]);

  const dragStart = () => callbacks.current.onDraggingChange(true);
  const drop = (from: number, to: number) => {
    callbacks.current.onDraggingChange(false);
    if (from === to) {
      index.set(-1);
      offset.set(0);
      return;
    }
    callbacks.current.onMove(from, to);
  };

  return (
    <Animated.View collapsable={!animateChanges} layout={layout} style={{ height: items.length * rowHeight }}>
      {items.map((item, position) => (
        <ReorderableRow
          key={item.id}
          position={position}
          drag={drag}
          className={rowClassName}
          animateRemoval={animateChanges}
          animateLayout={animateChanges && membership.changed}
          onDragStart={dragStart}
          onDrop={drop}
          render={(handle) => renderItem(item, handle, position)}
        />
      ))}
    </Animated.View>
  );
}

function ReorderableRow({
  position,
  drag,
  className,
  animateRemoval,
  animateLayout,
  onDragStart,
  onDrop,
  render,
}: {
  position: number;
  drag: DragState;
  className?: string;
  animateRemoval: boolean;
  animateLayout: boolean;
  onDragStart: () => void;
  onDrop: (from: number, to: number) => void;
  render: (handle: DragHandle) => ReactNode;
}) {
  const { index, offset, count, rowHeight } = drag;

  // The compiler memoizes this on its inputs; a new config object makes the gesture handler
  // reconfigure natively, which is why the inputs are kept stable above.
  const pan = usePanGesture({
    activateAfterLongPress: 150,
    onActivate: () => {
      "worklet";
      index.set(position);
      offset.set(0);
      scheduleOnRN(onDragStart);
    },
    onUpdate: (event) => {
      "worklet";
      offset.set(event.translationY);
    },
    onDeactivate: (event) => {
      "worklet";
      // A canceled drag (e.g. the system took the touch) springs back without saving.
      const to = event.canceled ? position : targetIndex(position, offset.get(), count.get(), rowHeight);
      // Settle on the target slot; the reorder lands once the row is there, and only if it got there.
      offset.set(
        withTiming((to - position) * rowHeight, { duration: 120 }, (finished) =>
          scheduleOnRN(onDrop, position, finished ? to : position),
        ),
      );
    },
  });

  const style = useAnimatedStyle(() => {
    const from = index.get();
    if (from < 0) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, shadowOpacity: 0 };
    if (from === position) {
      return { transform: [{ translateY: offset.get() }, { scale: 1.02 }], zIndex: 10, shadowOpacity: 0.15 };
    }
    // Rows between the dragged row's slot and its target make room for it.
    const to = targetIndex(from, offset.get(), count.get(), rowHeight);
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
      layout={animateLayout ? listLayoutTransition : undefined}
      exiting={animateRemoval ? listItemExit : undefined}
      className={cn("absolute right-0 left-0", className)}
      style={[{ top: position * rowHeight, height: rowHeight, shadowColor: "#000", shadowRadius: 8 }, style]}
    >
      {render(handle)}
    </Animated.View>
  );
}
