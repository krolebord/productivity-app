import { differenceInCalendarDays, endOfDay, getDaysInMonth, startOfDay, subDays, subMonths } from "date-fns";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DashboardRangeMode = "days" | "cycle";

export interface DashboardRangeConfig {
  mode: DashboardRangeMode;
  /** Trailing-window length for the "Last N days" mode (1–31). */
  days: number;
  /** Day-of-month the billing cycle starts on, for the "Since the Nth" mode (1–31). */
  cycleDay: number;
}

interface DashboardRangeStore extends DashboardRangeConfig {
  setMode: (mode: DashboardRangeMode) => void;
  setDays: (days: number) => void;
  setCycleDay: (day: number) => void;
}

const clampDay = (value: number) => Math.min(31, Math.max(1, Math.round(value || 0)));

/** Controls the time window the Overview summary cards and spending donut cover. */
export const useDashboardRangeStore = create<DashboardRangeStore>()(
  persist(
    (set) => ({
      mode: "days",
      days: 30,
      cycleDay: 25,
      setMode: (mode) => set({ mode }),
      setDays: (days) => set({ days: clampDay(days) }),
      setCycleDay: (cycleDay) => set({ cycleDay: clampDay(cycleDay) }),
    }),
    { name: "productivity-dashboard-range" },
  ),
);

function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** The most recent occurrence of `cycleDay` at or before `now`, clamped to month length. */
function cycleStartOnOrBefore(now: Date, cycleDay: number): Date {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(cycleDay, getDaysInMonth(now)));
  if (thisMonth.getTime() <= now.getTime()) {
    return thisMonth;
  }
  const prev = subMonths(now, 1);
  return new Date(prev.getFullYear(), prev.getMonth(), Math.min(cycleDay, getDaysInMonth(prev)));
}

export interface ResolvedDashboardRange {
  rangeStart: number;
  rangeEnd: number;
  prevRangeStart: number;
  prevRangeEnd: number;
  /** Descriptive subtitle, e.g. "Last 30 days" or "Since the 25th". */
  label: string;
  /** Compact suffix for the summary-card labels, e.g. "30d". */
  cardSuffix: string;
  /** Trailing text for the period-over-period delta, e.g. "previous 30 days". */
  prevLabel: string;
}

/**
 * Turns a stored range config into concrete millisecond boundaries plus the
 * preceding comparison window of equal shape. `now` is passed in so the result
 * stays stable for a render (avoids refetching on every tick).
 */
export function resolveDashboardRange(config: DashboardRangeConfig, now: Date): ResolvedDashboardRange {
  if (config.mode === "cycle") {
    const cycleStart = cycleStartOnOrBefore(now, config.cycleDay);
    const prevStart = cycleStartOnOrBefore(subDays(cycleStart, 1), config.cycleDay);
    const dayCount = differenceInCalendarDays(now, cycleStart) + 1;
    return {
      rangeStart: startOfDay(cycleStart).getTime(),
      rangeEnd: endOfDay(now).getTime(),
      prevRangeStart: startOfDay(prevStart).getTime(),
      prevRangeEnd: endOfDay(subDays(cycleStart, 1)).getTime(),
      label: `Since the ${ordinal(config.cycleDay)}`,
      cardSuffix: `${dayCount}d`,
      prevLabel: "previous cycle",
    };
  }

  const { days } = config;
  return {
    rangeStart: startOfDay(subDays(now, days - 1)).getTime(),
    rangeEnd: endOfDay(now).getTime(),
    prevRangeStart: startOfDay(subDays(now, days * 2 - 1)).getTime(),
    prevRangeEnd: endOfDay(subDays(now, days)).getTime(),
    label: `Last ${days} days`,
    cardSuffix: `${days}d`,
    prevLabel: `previous ${days} days`,
  };
}
