import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Debounces writes from an editor and flushes the pending one when the editor unmounts
 * (including a swiped-away modal) or the app goes to the background.
 */
export function useAutosave<T>(save: (value: T) => void, delay = 600) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) saveRef.current(next.value);
  }, []);

  const cancel = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current != null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    return () => {
      subscription.remove();
      flush();
    };
  }, [flush]);

  return { schedule, flush, cancel };
}
