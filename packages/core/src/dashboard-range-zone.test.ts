import { describe, expect, it } from "vitest";
import { resolveDashboardRange } from "./dashboard-range-store";

describe("dashboard ranges in a time zone", () => {
  it("uses calendar midnights across daylight saving", () => {
    const range = resolveDashboardRange(
      { mode: "days", days: 2, cycleDay: 1 },
      new Date("2026-03-09T12:00:00Z"),
      "America/New_York",
    );
    expect(range.rangeStart).toBe(Date.parse("2026-03-08T05:00:00Z"));
    expect(range.rangeEnd).toBe(Date.parse("2026-03-10T04:00:00Z") - 1);
  });
  it("clamps cycle day to the end of February", () => {
    const range = resolveDashboardRange(
      { mode: "cycle", days: 30, cycleDay: 31 },
      new Date("2026-03-02T12:00:00Z"),
      "America/New_York",
    );
    expect(range.rangeStart).toBe(Date.parse("2026-02-28T05:00:00Z"));
    expect(range.prevRangeStart).toBe(Date.parse("2026-01-31T05:00:00Z"));
  });
});
