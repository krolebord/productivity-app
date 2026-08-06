const DAY_DROP_PREFIX = "day-drop:";

export const INBOX_DROP_ID = "inbox-drop";

export function dayDropId(dateKey: string): string {
  return `${DAY_DROP_PREFIX}${dateKey}`;
}

export function dayDropDateKey(id: string): string | null {
  return id.startsWith(DAY_DROP_PREFIX) ? id.slice(DAY_DROP_PREFIX.length) : null;
}

/**
 * Drop zones (calendar days, inbox) are matched by pointer before list reorder
 * targets, so hovering one always wins over the row underneath it.
 */
export function isDropZoneId(id: string): boolean {
  return id === INBOX_DROP_ID || dayDropDateKey(id) != null;
}
