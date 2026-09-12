/**
 * How many trailing days the spending chart can show. The plot has to stay
 * hoverable, so N tracks the column width rather than the dashboard range.
 */

export const MIN_SPENDING_DAYS = 7;
export const MAX_SPENDING_DAYS = 60;
const FALLBACK_DAYS = 14;
const CHART_CHROME_PX = 104;
const PX_PER_DAY = 22;

export function spendingDaysForWidth(width: number): number {
  if (width <= 0) {
    return FALLBACK_DAYS;
  }

  const days = Math.floor((width - CHART_CHROME_PX) / PX_PER_DAY);
  return Math.min(MAX_SPENDING_DAYS, Math.max(MIN_SPENDING_DAYS, days));
}
