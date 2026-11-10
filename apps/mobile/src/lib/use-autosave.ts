import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Debounces writes from an editor and flushes the pending one when the editor unmounts
 * (including a swiped-away modal) or the app goes to the background. Writes scheduled
 * after unmount (e.g. a child committing its draft on the way out) are saved right away,
 * unless the editor was discarded (its record deleted), after which nothing is saved.
 *
 * `save` reads the editor's fields when it runs, not when it was scheduled, so a field that
 * changed in between (adopted from the row after a remote edit) is saved as it is now.
 */
export function useAutosave(save: () => void, delay = 600) {
  const saveRef = useRef(save);
  // Updated after each commit, not during render; layout effects run before the unmount flush.
  useLayoutEffect(() => {
    saveRef.current = save;
  });
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const discarded = useRef(false);

  const flush = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    const wasPending = pending.current;
    pending.current = false;
    if (wasPending && !discarded.current) saveRef.current();
  }, []);

  const cancel = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = false;
  }, []);

  /** Drops pending and future saves, for an editor whose record is being deleted. */
  const discard = useCallback(() => {
    discarded.current = true;
    cancel();
  }, [cancel]);

  const schedule = useCallback(() => {
    if (discarded.current) return;
    pending.current = true;
    if (!mounted.current) return flush();
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      flush();
    };
  }, [flush]);

  return { schedule, flush, cancel, discard };
}
