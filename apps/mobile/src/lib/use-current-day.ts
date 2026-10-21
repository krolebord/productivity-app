import { addLocalDays, toDateKey } from "@productivity/core/agenda";
import { localMidnightMs } from "@productivity/core/date-time";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Local calendar day as "YYYY-MM-DD", refreshed at midnight. Timers don't run while the app
 * is suspended, so returning to the foreground re-checks too.
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
      if (timeout != null) clearTimeout(timeout);
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

    schedule();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      sync();
      schedule();
    });

    return () => {
      if (timeout != null) clearTimeout(timeout);
      subscription.remove();
    };
  }, []);

  return dayKey;
}
