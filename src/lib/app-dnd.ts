const CALENDAR_DAY_PREFIX = "calendar-day:";

export function calendarDayDroppableId(dateKey: string): string {
  return `${CALENDAR_DAY_PREFIX}${dateKey}`;
}

export function calendarDayFromDroppableId(id: string): string | null {
  return id.startsWith(CALENDAR_DAY_PREFIX) ? id.slice(CALENDAR_DAY_PREFIX.length) : null;
}
