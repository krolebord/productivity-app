import { differenceInCalendarDays, endOfDay, getDaysInMonth, startOfDay, subDays, subMonths } from "date-fns";

export type DashboardRangeMode = "days" | "cycle";

export interface DashboardRangeConfig {
  mode: DashboardRangeMode;
  days: number;
  cycleDay: number;
}

export const clampDashboardRangeValue = (value: number) => Math.min(31, Math.max(1, Math.round(value || 0)));

function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
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
  label: string;
  cardSuffix: string;
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
