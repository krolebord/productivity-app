import { useCallback, useState } from "react";
import { reorderByOrder } from "./reorder";

/**
 * A list sorted by `order` (memoized: a new array means the query caught up) with drag moves
 * applied. A move paints right away and hands the order writes to `save`; the override is
 * dropped as soon as a new list comes in.
 */
export function useReorderable<T extends { id: string; order: number }>(
  list: readonly T[],
  save: (changes: { id: string; order: number }[]) => void,
) {
  const [moved, setMoved] = useState<{ source: readonly T[]; ordered: readonly T[] } | null>(null);
  const items = moved?.source === list ? moved.ordered : list;

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
      const { ordered, changes } = reorderByOrder(items, from, to);
      setMoved({ source: list, ordered });
      save(changes);
    },
    [items, list, save],
  );

  return { items, move };
}
