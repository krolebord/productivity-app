import {
  differenceInCalendarDays,
  endOfDay,
  format,
  getDaysInMonth,
  isSameDay,
  startOfDay,
  subDays,
  subMonths,
} from "date-fns";
import { shiftDateKey, todayDateKeyInZone, zonedMidnightMs } from "./time-zone";

export type DashboardRangeMode = "days" | "cycle";

export interface DashboardRangeConfig {
  mode: DashboardRangeMode;
  days: number;
  cycleDay: number;
}

export const clampDashboardRangeValue = (value: number) => Math.min(31, Math.max(1, Math.round(value || 0)));

/** "1st", "22nd", "11th". */
export function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** "Jul 25 – Aug 5", collapsed to a single date when the window is one day. */
function formatSpan(start: Date, end: Date) {
  return isSameDay(start, end) ? format(start, "MMM d") : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

export function cycleStartOnOrBefore(now: Date, cycleDay: number): Date {
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
  /** How the window was configured, e.g. "Since the 25th". */
  label: string;
  /** The dates the window actually covers, e.g. "Jul 25 – Aug 5". */
  spanLabel: string;
  cardSuffix: string;
  prevLabel: string;
}

/**
 * Turns a stored range config into concrete millisecond boundaries plus the
 * preceding comparison window of equal shape. `now` is passed in so the result
 * stays stable for a render (avoids refetching on every tick).
 */
export function resolveDashboardRange(
  config: DashboardRangeConfig,
  now: Date,
  timeZone?: string,
): ResolvedDashboardRange {
  if (timeZone) {
    const key = todayDateKeyInZone(timeZone, now);
    const [year, month, day] = key.split("-").map(Number);
    // Calendar arithmetic uses a local date only as a carrier for the zone's date.
    const resolved = resolveDashboardRange(config, new Date(year, month - 1, day, 12));
    const dateKey = (ms: number) => format(new Date(ms), "yyyy-MM-dd");
    const start = (ms: number) => zonedMidnightMs(dateKey(ms), timeZone);
    const end = (ms: number) => zonedMidnightMs(shiftDateKey(dateKey(ms), 1), timeZone) - 1;
    return {
      ...resolved,
      rangeStart: start(resolved.rangeStart),
      rangeEnd: end(resolved.rangeEnd),
      prevRangeStart: start(resolved.prevRangeStart),
      prevRangeEnd: end(resolved.prevRangeEnd),
    };
  }
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
      spanLabel: formatSpan(cycleStart, now),
      cardSuffix: `${dayCount}d`,
      prevLabel: "previous cycle",
    };
  }

  const { days } = config;
  const windowStart = subDays(now, days - 1);
  return {
    rangeStart: startOfDay(windowStart).getTime(),
    rangeEnd: endOfDay(now).getTime(),
    prevRangeStart: startOfDay(subDays(now, days * 2 - 1)).getTime(),
    prevRangeEnd: endOfDay(subDays(now, days)).getTime(),
    label: `Last ${days} days`,
    spanLabel: formatSpan(windowStart, now),
    cardSuffix: `${days}d`,
    prevLabel: `previous ${days} days`,
  };
}
