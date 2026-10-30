import { describe, expect, it } from "vitest";
import {
  canonicalTimeZone,
  dateKeyInZone,
  hourInZone,
  isValidTimeZone,
  timeInZone,
  timeZoneMismatch,
  zonedTimeMs,
} from "./time-zone";

describe("zonedTimeMs", () => {
  it("reads a wall-clock time in the given zone", () => {
    expect(zonedTimeMs("2026-08-03", 14, 30, "Europe/Kyiv")).toBe(Date.parse("2026-08-03T14:30:00+03:00"));
    expect(zonedTimeMs("2026-08-03", 9, 0, "America/New_York")).toBe(Date.parse("2026-08-03T09:00:00-04:00"));
  });

  it("uses the offset in force on that date across DST", () => {
    expect(zonedTimeMs("2026-11-10", 9, 0, "Europe/Kyiv")).toBe(Date.parse("2026-11-10T09:00:00+02:00"));
  });
});

describe("dateKeyInZone / timeInZone", () => {
  it("reports the local day and time of an instant", () => {
    // 22:30 UTC is already the next day in Kyiv and still the same evening in New York.
    const ms = Date.parse("2026-08-03T22:30:00Z");
    expect(dateKeyInZone(ms, "Europe/Kyiv")).toBe("2026-08-04");
    expect(timeInZone(ms, "Europe/Kyiv")).toBe("01:30");
    expect(dateKeyInZone(ms, "America/New_York")).toBe("2026-08-03");
    expect(hourInZone(ms, "America/New_York")).toBe(18);
  });

  it("formats midnight as 00:00", () => {
    expect(timeInZone(Date.parse("2026-08-03T00:00:00+03:00"), "Europe/Kyiv")).toBe("00:00");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isValidTimeZone("Europe/Kyiv")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("canonicalTimeZone", () => {
  it("maps aliases to one name and leaves unknown zones alone", () => {
    expect(canonicalTimeZone("Europe/Kyiv")).toBe(canonicalTimeZone("Europe/Kiev"));
    expect(canonicalTimeZone("Mars/Olympus")).toBe("Mars/Olympus");
  });
});

describe("timeZoneMismatch", () => {
  it("is null while no zone is saved", () => {
    expect(timeZoneMismatch("", "Europe/Kyiv")).toBeNull();
  });

  it("treats aliases of the same zone as a match", () => {
    expect(timeZoneMismatch("Europe/Kiev", canonicalTimeZone("Europe/Kyiv"))).toBeNull();
  });

  it("reports both zones and a stable key for a real difference", () => {
    const mismatch = timeZoneMismatch("Europe/Kyiv", "America/New_York");
    expect(mismatch).toEqual({
      saved: canonicalTimeZone("Europe/Kyiv"),
      device: "America/New_York",
      key: `${canonicalTimeZone("Europe/Kyiv")}→America/New_York`,
    });
  });
});
