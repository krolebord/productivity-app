import { type CSSProperties, type Key, type Ref, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MasonryRect = { x: number; y: number; width: number; height: number };

/**
 * Google Keep-style masonry layout: fixed-width columns centered in the
 * container, items placed in order into the currently shortest column.
 * Items are absolutely positioned via transforms so position changes animate,
 * and the computed rects are exposed so callers (e.g. drag-and-drop collision
 * detection) can work off the target layout instead of mid-animation DOM rects.
 */
export function useMasonryLayout<T>({
  items,
  itemKey,
  columnWidth,
  gap,
}: {
  items: T[];
  itemKey: (item: T) => Key;
  columnWidth: number;
  gap: number;
}) {
  const [outerEl, setOuterEl] = useState<HTMLElement | null>(null);
  const [innerEl, setInnerEl] = useState<HTMLElement | null>(null);
  const [outerWidth, setOuterWidth] = useState(0);
  const [heights, setHeights] = useState<ReadonlyMap<Key, number>>(new Map());

  useEffect(() => {
    if (!outerEl) return;
    const ro = new ResizeObserver(([entry]) => setOuterWidth(entry.contentRect.width));
    ro.observe(outerEl);
    return () => ro.disconnect();
  }, [outerEl]);

  const elementKeys = useRef(new Map<Element, Key>());
  const heightObserver = useMemo(() => {
    if (typeof ResizeObserver === "undefined") return null;
    return new ResizeObserver((entries) => {
      setHeights((prev) => {
        let next: Map<Key, number> | null = null;
        for (const entry of entries) {
          const key = elementKeys.current.get(entry.target);
          if (key === undefined) continue;
          const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          if ((next ?? prev).get(key) === height) continue;
          next ??= new Map(prev);
          next.set(key, height);
        }
        return next ?? prev;
      });
    });
  }, []);

  // Ref callbacks are cached per key so React doesn't detach/reattach (and
  // churn the observer) on every render.
  const itemRefCache = useRef(new Map<Key, (el: HTMLElement | null) => (() => void) | undefined>());
  const getItemRef = useCallback(
    (key: Key) => {
      let refFn = itemRefCache.current.get(key);
      if (!refFn) {
        refFn = (el) => {
          if (!el || !heightObserver) return undefined;
          elementKeys.current.set(el, key);
          heightObserver.observe(el);
          return () => {
            heightObserver.unobserve(el);
            elementKeys.current.delete(el);
          };
        };
        itemRefCache.current.set(key, refFn);
      }
      return refFn;
    },
    [heightObserver],
  );

  const layout = useMemo(() => {
    if (outerWidth === 0) {
      return {
        rects: new Map<Key, MasonryRect>(),
        columnWidth,
        columnCount: 1,
        innerWidth: 0,
        innerHeight: 0,
      };
    }
    const colWidth = Math.min(columnWidth, outerWidth);
    const columnCount = Math.max(1, Math.floor((outerWidth + gap) / (colWidth + gap)));
    const colHeights = new Array<number>(columnCount).fill(0);
    const rects = new Map<Key, MasonryRect>();
    for (const item of items) {
      const key = itemKey(item);
      const height = heights.get(key);
      if (height === undefined) continue;
      let col = 0;
      for (let i = 1; i < columnCount; i++) {
        if (colHeights[i] < colHeights[col]) col = i;
      }
      rects.set(key, { x: col * (colWidth + gap), y: colHeights[col], width: colWidth, height });
      colHeights[col] += height + gap;
    }
    return {
      rects,
      columnWidth: colWidth,
      columnCount,
      innerWidth: columnCount * colWidth + (columnCount - 1) * gap,
      innerHeight: Math.max(0, Math.max(...colHeights) - gap),
    };
  }, [items, itemKey, heights, outerWidth, columnWidth, gap]);

  // Snapshot of the rects from the previously committed render: an item that
  // had no position yet must not animate in from (0, 0).
  const prevRectsRef = useRef<ReadonlyMap<Key, MasonryRect>>(new Map());
  useEffect(() => {
    prevRectsRef.current = layout.rects;
  }, [layout.rects]);

  const getItemProps = useCallback(
    (key: Key): { ref: Ref<HTMLDivElement>; style: CSSProperties } => {
      const rect = layout.rects.get(key);
      const style: CSSProperties = rect
        ? {
            position: "absolute",
            top: 0,
            left: 0,
            width: rect.width,
            transform: `translate(${rect.x}px, ${rect.y}px)`,
            transition: prevRectsRef.current.has(key) ? "transform 200ms ease" : "none",
          }
        : {
            position: "absolute",
            top: 0,
            left: 0,
            width: layout.columnWidth,
            visibility: "hidden",
          };
      return { ref: getItemRef(key), style };
    },
    [layout, getItemRef],
  );

  return {
    outerProps: { ref: setOuterEl as Ref<HTMLDivElement> },
    innerProps: {
      ref: setInnerEl as Ref<HTMLDivElement>,
      style: {
        position: "relative",
        width: layout.innerWidth,
        height: layout.innerHeight,
        margin: "0 auto",
      } satisfies CSSProperties,
    },
    innerEl,
    rects: layout.rects,
    columnWidth: layout.columnWidth,
    getItemProps,
  };
}
