import { useEffect, useRef } from "react";

const BOTTOM_INSET_VAR = "--bottom-inset";

/**
 * Publishes the height of an element pinned to the bottom of the viewport, so
 * the mobile floating buttons can sit above it rather than on top of it. The
 * returned ref goes on the pinned element; the variable is cleared on unmount.
 */
export function useBottomInset<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? element.getBoundingClientRect().height;
      document.documentElement.style.setProperty(BOTTOM_INSET_VAR, `${height}px`);
    });
    observer.observe(element, { box: "border-box" });

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(BOTTOM_INSET_VAR);
    };
  }, [enabled]);

  return ref;
}
