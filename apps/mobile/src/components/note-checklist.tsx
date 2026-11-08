import {
  type ChecklistBlock,
  type ChecklistItem,
  insertChecklistItem,
  isItemChecked,
  itemDepth,
  itemText,
  moveOpenChecklistItem,
  removeChecklistItem,
  setChecklistItemText,
  toggleChecklistItem,
} from "@productivity/core/note-blocks";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Pressable, Text, type TextInputInstance, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { cn } from "../lib/utils";
import { Icon } from "./ui/icon";
import { Input } from "./ui/input";

export type ChecklistFocus = { itemId: string; at: "start" | "end" } | null;

/**
 * A checklist edited as rows, as in Keep: open items can be dragged by their grip, Enter adds
 * an item, Backspace in an empty item removes it, and checked items collect in a collapsible
 * section below. Every change goes out through `onUpdate` (null when the last item is removed).
 */
export function NoteChecklist({
  block,
  onUpdate,
  focus,
  onFocusHandled,
  onRequestFocus,
  onFocusItem,
  onLeaveStart,
  onDraggingChange,
}: {
  block: ChecklistBlock;
  /** Applies an edit to the latest version of this block; null removes it. */
  onUpdate: (edit: (current: ChecklistBlock) => ChecklistBlock | null) => void;
  /** An item to focus once it has rendered. */
  focus: ChecklistFocus;
  onFocusHandled: () => void;
  onRequestFocus: (focus: ChecklistFocus) => void;
  onFocusItem: () => void;
  /** Backspace in the first, empty item of the list: the editor moves focus out. */
  onLeaveStart: () => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const [showChecked, setShowChecked] = useState(false);
  const inputs = useRef(new Map<string, TextInputInstance>());
  const open = block.items.filter((item) => !isItemChecked(item));
  const checked = block.items.filter(isItemChecked);

  useLayoutEffect(() => {
    if (!focus) return;
    const input = inputs.current.get(focus.itemId);
    if (!input) return;
    input.focus();
    onFocusHandled();
  });

  // Edits apply to the latest block, not this render's: Enter can fire a text change and a
  // submit in the same frame, and both must land.
  const addAfter = (id: string | null) => {
    let newId = "";
    onUpdate((current) => {
      const next = insertChecklistItem(current, id);
      newId = next.id;
      return next.block;
    });
    if (newId) onRequestFocus({ itemId: newId, at: "start" });
  };

  const changeText = (item: ChecklistItem, text: string) => {
    if (!text.includes("\n")) {
      onUpdate((current) => setChecklistItemText(current, item.id, text));
      return;
    }
    const [first, ...more] = text.split("\n");
    // A lone trailing line break is Enter, which onSubmit handles.
    if (more.length === 1 && more[0] === "") {
      onUpdate((current) => setChecklistItemText(current, item.id, first));
      return;
    }
    // Pasted lines become items of their own.
    let after = item.id;
    onUpdate((current) => {
      let next = setChecklistItemText(current, item.id, first);
      for (const line of more) {
        const inserted = insertChecklistItem(next, after, line.trim());
        next = inserted.block;
        after = inserted.id;
      }
      return next;
    });
    onRequestFocus({ itemId: after, at: "end" });
  };

  const removeEmpty = (item: ChecklistItem) => {
    const index = block.items.findIndex((i) => i.id === item.id);
    const previous = block.items
      .slice(0, index)
      .reverse()
      .find((i) => !isItemChecked(i));
    if (!previous) {
      onUpdate((current) => removeChecklistItem(current, item.id));
      onLeaveStart();
      return;
    }
    onUpdate((current) => removeChecklistItem(current, item.id));
    onRequestFocus({ itemId: previous.id, at: "end" });
  };

  const row = (item: ChecklistItem, grip?: ReactNode) => (
    <ChecklistRow
      key={item.id}
      item={item}
      grip={grip}
      inputRef={(input) => {
        if (input) inputs.current.set(item.id, input);
        else inputs.current.delete(item.id);
      }}
      onToggle={() => onUpdate((current) => toggleChecklistItem(current, item.id))}
      onChangeText={(text) => changeText(item, text)}
      onSubmit={() => addAfter(item.id)}
      onBackspaceEmpty={() => removeEmpty(item)}
      onFocus={onFocusItem}
    />
  );

  return (
    <View>
      <ReorderableRows
        items={open}
        onMove={(from, to) => onUpdate((current) => moveOpenChecklistItem(current, from, to))}
        onDraggingChange={onDraggingChange}
        renderItem={(item, grip) => row(item, grip)}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => addAfter(open.at(-1)?.id ?? null)}
        className="min-h-11 flex-row items-center gap-3 pl-7 active:opacity-70"
      >
        <Icon name="plus" size={18} colorClassName="accent-muted-foreground" />
        <Text className="text-base text-muted-foreground">List item</Text>
      </Pressable>
      {checked.length > 0 && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showChecked }}
            onPress={() => setShowChecked((value) => !value)}
            className="min-h-11 flex-row items-center gap-2 pl-1 active:opacity-70"
          >
            <Icon
              name={showChecked ? "chevron-down" : "chevron-right"}
              size={16}
              colorClassName="accent-muted-foreground"
            />
            <Text className="text-muted-foreground text-sm">
              {checked.length} checked {checked.length === 1 ? "item" : "items"}
            </Text>
          </Pressable>
          {showChecked && checked.map((item) => row(item))}
        </>
      )}
    </View>
  );
}

function ChecklistRow({
  item,
  grip,
  inputRef,
  onToggle,
  onChangeText,
  onSubmit,
  onBackspaceEmpty,
  onFocus,
}: {
  item: ChecklistItem;
  grip?: ReactNode;
  inputRef: (input: TextInputInstance | null) => void;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onBackspaceEmpty: () => void;
  onFocus: () => void;
}) {
  const done = isItemChecked(item);
  const text = itemText(item);
  // Android fires onSubmitEditing twice for one Enter on a multiline input; one press, one item.
  const lastSubmit = useRef(0);
  return (
    <View className="flex-row items-start" style={{ paddingLeft: itemDepth(item) * 24 }}>
      <View className="h-11 w-7 items-center justify-center">{grip}</View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={text || "List item"}
        hitSlop={6}
        onPress={onToggle}
        className="h-11 w-8 items-center justify-center"
      >
        <View
          className={cn(
            "size-5 items-center justify-center rounded-md border-2",
            done ? "border-primary bg-primary" : "border-muted-foreground",
          )}
        >
          {done && <Icon name="check" size={14} colorClassName="accent-primary-foreground" />}
        </View>
      </Pressable>
      <Input
        ref={inputRef}
        value={text}
        onChangeText={onChangeText}
        onSubmitEditing={() => {
          const now = Date.now();
          if (now - lastSubmit.current < 300) return;
          lastSubmit.current = now;
          onSubmit();
        }}
        submitBehavior="submit"
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Backspace" && text === "") onBackspaceEmpty();
        }}
        onFocus={onFocus}
        multiline
        placeholder="List item"
        className={cn("flex-1 py-2.5 pr-1", done && "text-muted-foreground line-through")}
      />
    </View>
  );
}

type Drag = { index: SharedValue<number>; offset: SharedValue<number>; heights: SharedValue<number[]> };

/** Where the dragged row lands: past every other row whose middle its own middle has crossed. */
function landing(from: number, offset: number, heights: number[]) {
  "worklet";
  let top = 0;
  for (let i = 0; i < from; i++) top += heights[i] ?? 0;
  const middle = top + offset + (heights[from] ?? 0) / 2;
  // Count the other rows whose middle, where they lie now, is above the dragged row's.
  let to = 0;
  let edge = 0;
  for (let i = 0; i < heights.length; i++) {
    const height = heights[i] ?? 0;
    if (i !== from && middle > edge + height / 2) to++;
    edge += height;
  }
  return to;
}

function distance(from: number, to: number, heights: number[]) {
  "worklet";
  let total = 0;
  if (to > from) for (let i = from + 1; i <= to; i++) total += heights[i] ?? 0;
  else for (let i = to; i < from; i++) total -= heights[i] ?? 0;
  return total;
}

/**
 * Rows dragged into a new slot by their grip. Unlike ReorderableList, rows keep their natural
 * heights (items wrap), measured as they lay out.
 */
function ReorderableRows<T extends { id: string }>({
  items,
  onMove,
  onDraggingChange,
  renderItem,
}: {
  items: readonly T[];
  onMove: (from: number, to: number) => void;
  onDraggingChange: (dragging: boolean) => void;
  renderItem: (item: T, grip: ReactNode) => ReactNode;
}) {
  const index = useSharedValue(-1);
  const offset = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);
  const drag: Drag = { index, offset, heights };
  const callbacks = useRef({ onMove, onDraggingChange });
  useLayoutEffect(() => {
    callbacks.current = { onMove, onDraggingChange };
  });

  const orderKey = items.map((item) => item.id).join("|");
  // Release the dragged row once the new order has rendered, so it doesn't flash back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: orderKey is the trigger; shared values are stable.
  useLayoutEffect(() => {
    index.set(-1);
    offset.set(0);
    // Forget heights of rows that are gone; the remaining ones re-measure as they move.
    const count = items.length;
    heights.modify((sizes) => {
      "worklet";
      sizes.length = Math.min(sizes.length, count);
      return sizes;
    });
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
    <View>
      {items.map((item, position) => (
        <ReorderableRow
          key={item.id}
          position={position}
          drag={drag}
          onDragStart={dragStart}
          onDrop={drop}
          render={(grip) => renderItem(item, grip)}
        />
      ))}
    </View>
  );
}

function ReorderableRow({
  position,
  drag,
  onDragStart,
  onDrop,
  render,
}: {
  position: number;
  drag: Drag;
  onDragStart: () => void;
  onDrop: (from: number, to: number) => void;
  render: (grip: ReactNode) => ReactNode;
}) {
  const { index, offset, heights } = drag;
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
      const sizes = heights.get();
      const to = event.canceled ? position : landing(position, offset.get(), sizes);
      offset.set(
        withTiming(distance(position, to, sizes), { duration: 120 }, (finished) =>
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
    const sizes = heights.get();
    const to = landing(from, offset.get(), sizes);
    const height = sizes[from] ?? 0;
    const shift = from < position && position <= to ? -height : to <= position && position < from ? height : 0;
    return {
      transform: [{ translateY: withTiming(shift, { duration: 150 }) }, { scale: 1 }],
      zIndex: 0,
      shadowOpacity: 0,
    };
  });

  const grip = (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel="Reorder" className="h-11 w-7 items-center justify-center">
        <Icon name="menu" size={16} colorClassName="accent-muted-foreground/60" />
      </View>
    </GestureDetector>
  );

  return (
    <Animated.View
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        heights.modify((sizes) => {
          "worklet";
          sizes[position] = height;
          return sizes;
        });
      }}
      className="bg-background"
      style={[{ shadowColor: "#000", shadowRadius: 8 }, style]}
    >
      {render(grip)}
    </Animated.View>
  );
}
