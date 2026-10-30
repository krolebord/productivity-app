const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Offset of `timeZone` from UTC at `instant`, in ms.
 *
 * Derived through `Intl` rather than a date library: the worker runtime has full ICU, and the
 * alternative is another dependency for one conversion.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }

  const asUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );

  return asUtc - instant.getTime();
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The engine's canonical name for `timeZone`, so aliases like "Europe/Kiev" and "Europe/Kyiv" compare equal. */
export function canonicalTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    return timeZone;
  }
}

/** The device's own zone, canonicalized; the same `Intl` read works on the web and on Hermes. */
export function deviceTimeZone(): string {
  return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export type TimeZoneMismatch = {
  saved: string;
  device: string /** Identifies the pair, for "don't ask again". */;
  key: string;
};

/**
 * Whether a device should offer to switch the saved zone to its own. Null while nothing is saved
 * (the device initializes it instead) or when both name the same zone, aliases included.
 */
export function timeZoneMismatch(savedTimeZone: string, deviceZone: string): TimeZoneMismatch | null {
  if (!savedTimeZone) return null;
  const saved = canonicalTimeZone(savedTimeZone);
  const device = canonicalTimeZone(deviceZone);
  if (saved === device) return null;
  return { saved, device, key: `${saved}→${device}` };
}

/**
 * Epoch ms of the wall-clock time `hours:minutes` on `dateKey` ("YYYY-MM-DD") in `timeZone`.
 * The offset is resolved twice because the first guess can land on the wrong side of a DST
 * transition.
 */
export function zonedTimeMs(dateKey: string, hours: number, minutes: number, timeZone: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const asUtc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hours, minutes);

  let offset = timeZoneOffsetMs(new Date(asUtc), timeZone);
  offset = timeZoneOffsetMs(new Date(asUtc - offset), timeZone);

  return asUtc - offset;
}

/**
 * Epoch ms of midnight on `dateKey` ("YYYY-MM-DD") in `timeZone`.
 *
 * All-day Google events carry a bare date in the calendar's timezone, so anchoring them to the
 * calendar's midnight (not the worker's UTC midnight) is what keeps them on the right day for
 * users west of UTC.
 */
export function zonedMidnightMs(dateKey: string, timeZone: string): number {
  return zonedTimeMs(dateKey, 0, 0, timeZone);
}

export function todayDateKeyInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Calendar day ("YYYY-MM-DD") of the instant `ms` in `timeZone`. */
export function dateKeyInZone(ms: number, timeZone: string): string {
  return todayDateKeyInZone(timeZone, new Date(ms));
}

/** Wall-clock time ("HH:mm") of the instant `ms` in `timeZone`. */
export function timeInZone(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(
    new Date(ms),
  );
}

export function hourInZone(ms: number, timeZone: string): number {
  return Number(timeInZone(ms, timeZone).slice(0, 2));
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}
