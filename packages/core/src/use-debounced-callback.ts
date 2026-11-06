import { useEffect, useLayoutEffect, useState } from "react";

export type DebouncedCallback<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
  flush: () => void;
  pending: () => boolean;
};

export function createDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number,
): DebouncedCallback<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  const flush = (): void => {
    if (timer === null) return;

    clearTimeout(timer);
    timer = null;

    const args = lastArgs;
    lastArgs = null;

    if (!args) return;

    callback(...args);
  };

  const pending = () => timer !== null;

  const debounced = ((...args: TArgs) => {
    lastArgs = args;

    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;

      const a = lastArgs;
      lastArgs = null;

      if (!a) return;

      callback(...a);
    }, delay);
  }) as DebouncedCallback<TArgs>;

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced;
}

/** A debounced function whose callback and delay can be swapped without changing its identity. */
function createDebounceController<TArgs extends unknown[]>(callback: (...args: TArgs) => void, delay: number) {
  let latestCallback = callback;
  let latestDelay = delay;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    if (args) latestCallback(...args);
  };

  const debounced: DebouncedCallback<TArgs> = Object.assign(
    (...args: TArgs) => {
      lastArgs = args;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, latestDelay);
    },
    { cancel, flush, pending: () => timer !== null },
  );

  return {
    debounced,
    update: (nextCallback: (...args: TArgs) => void, nextDelay: number) => {
      // A new delay drops the call pending under the old one (it was timed with that delay).
      if (nextDelay !== latestDelay) cancel();
      latestCallback = nextCallback;
      latestDelay = nextDelay;
    },
  };
}

/**
 * A stable debounced function that always calls the latest `callback`. A pending call is
 * dropped on unmount and when `delay` changes.
 */
export function useDebounceCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number,
): DebouncedCallback<TArgs> {
  const [controller] = useState(() => createDebounceController(callback, delay));

  // After each commit rather than during render, so renders stay pure.
  useLayoutEffect(() => {
    controller.update(callback, delay);
  });

  useEffect(() => controller.debounced.cancel, [controller]);

  return controller.debounced;
}
