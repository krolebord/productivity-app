import { useEffect, useState } from "react";
import { addLocalDays, toDateKey } from "./agenda";
import { localMidnightMs } from "./date-time";

/**
 * Local calendar day as "YYYY-MM-DD", refreshed at midnight so long-lived views
 * don't keep rendering a stale day. Background tabs throttle timers and suspended
 * machines skip them entirely, so visibility changes re-check too.
 */
export function useCurrentDayKey(): string {
  const [dayKey, setDayKey] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const next = toDateKey(new Date());
      setDayKey((prev) => (prev === next ? prev : next));
    };

    const schedule = () => {
      const now = new Date();
      const msUntilMidnight = localMidnightMs(addLocalDays(now, 1)) - now.getTime();
      timeout = setTimeout(
        () => {
          sync();
          schedule();
        },
        Math.max(msUntilMidnight, 1_000),
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      sync();
      if (timeout != null) clearTimeout(timeout);
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timeout != null) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return dayKey;
}
