import { format, isSameYear } from "date-fns";

export function formatDateTimeLocal(timestamp: number) {
  return format(timestamp, "yyyy-MM-dd'T'HH:mm");
}

export function formatDateTimeDisplay(timestamp: number) {
  return format(timestamp, "MMM d, yyyy HH:mm");
}

/** Short date for tight rows: "Oct 28", with the year only outside the current one ("Oct 28, 2025"). */
export function formatShortDate(timestamp: number, now: number = Date.now()) {
  return format(timestamp, isSameYear(timestamp, now) ? "MMM d" : "MMM d, yyyy");
}

export function parseDateTimeLocal(value: string) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error("Please enter a valid date and time.");
  }

  return timestamp;
}

/** Local midnight of the given calendar day, as epoch ms. */
export function localMidnightMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Combine a local calendar day with an "HH:mm" time into epoch ms. */
export function combineLocalDateAndTime(date: Date, time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  const hours = match ? Number(match[1]) : 0;
  const minutes = match ? Number(match[2]) : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime();
}

/** Compact due label for badges: "Mar 5" or "Mar 5 15:00". */
export function formatDueDateLabel(dueAt: number, hasDueTime: boolean): string {
  const date = new Date(dueAt);
  const datePart = format(date, "MMM d");
  if (!hasDueTime) return datePart;
  return `${datePart} ${format(date, "HH:mm")}`;
}
