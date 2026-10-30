import { useEffect, useRef } from "react";

/**
 * Runs `flush` when the page is hidden (tab switched or closed, app backgrounded, window
 * minimized) or unloaded, so a debounced autosave isn't lost with the page.
 */
export function useFlushOnHide(flush: () => void) {
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onPageHide = () => flushRef.current();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);
}
