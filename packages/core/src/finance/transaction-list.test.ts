import { describe, expect, it } from "vitest";
import {
  activeTransactionFilters,
  clearTransactionFilter,
  formatDayHeader,
  formatShortDayHeader,
  formatTimeRangeLabel,
  groupTransactionsByDay,
  TIME_RANGE_PRESETS,
} from "./transaction-list";

const at = (iso: string) => new Date(iso).getTime();
const now = new Date("2026-10-30T15:00:00");

describe("groupTransactionsByDay", () => {
  const rows = [
    { id: "a", effectiveAt: at("2026-10-30T09:00:00") },
    { id: "b", effectiveAt: at("2026-10-30T08:00:00") },
    { id: "c", effectiveAt: at("2026-10-28T20:00:00") },
  ];

  it("splits a date sort into consecutive local days", () => {
    const groups = groupTransactionsByDay(rows, "date_desc");
    expect(groups.map((group) => [group.key, group.transactions.map((row) => row.id)])).toEqual([
      ["2026-10-30", ["a", "b"]],
      ["2026-10-28", ["c"]],
    ]);
    expect(groups[0].timestamp).toBe(rows[0].effectiveAt);
  });

  it("returns one headerless group for other sorts", () => {
    const groups = groupTransactionsByDay(rows, "amount_desc");
    expect(groups).toHaveLength(1);
    expect(groups[0].timestamp).toBeNull();
    expect(groups[0].transactions).toHaveLength(3);
  });

  it("returns nothing for an empty page", () => {
    expect(groupTransactionsByDay([], "title_asc")).toEqual([]);
    expect(groupTransactionsByDay([], "date_asc")).toEqual([]);
  });
});

describe("day headers", () => {
  it("names today and yesterday", () => {
    expect(formatDayHeader(at("2026-10-30T01:00:00"), now)).toBe("Today");
    expect(formatDayHeader(at("2026-10-29T23:00:00"), now)).toBe("Yesterday");
    expect(formatDayHeader(at("2026-10-27T12:00:00"), now)).toBe("Tuesday, Oct 27, 2026");
  });

  it("drops this year from the short form", () => {
    expect(formatShortDayHeader(at("2026-10-27T12:00:00"), now)).toBe("Tuesday, Oct 27");
    expect(formatShortDayHeader(at("2025-12-31T12:00:00"), now)).toBe("Wed, Dec 31, 2025");
  });
});

describe("time ranges", () => {
  it("covers whole days ending today", () => {
    const range = TIME_RANGE_PRESETS[0].getRange(now);
    expect(new Date(range.from)).toEqual(new Date("2026-10-24T00:00:00"));
    expect(new Date(range.to).getHours()).toBe(23);
    expect(new Date(TIME_RANGE_PRESETS[2].getRange(now).from)).toEqual(new Date("2026-01-01T00:00:00"));
  });

  it("labels open and closed ranges", () => {
    const from = at("2026-10-01T00:00:00");
    const to = at("2026-10-30T23:59:59");
    expect(formatTimeRangeLabel(from, to)).toBe("Oct 1, 2026 - Oct 30, 2026");
    expect(formatTimeRangeLabel(from)).toBe("From Oct 1, 2026");
    expect(formatTimeRangeLabel(undefined, to)).toBe("Until Oct 30, 2026");
    expect(formatTimeRangeLabel()).toBe("All time");
  });
});

describe("active filters", () => {
  it("lists set filters in display order with readable values", () => {
    const chips = activeTransactionFilters(
      { category: "Food", importance: "none", type: "adjustment", accountId: "acc", currency: "EUR" },
      "Checking",
    );
    expect(chips.map((chip) => [chip.key, chip.value])).toEqual([
      ["account", "Checking"],
      ["currency", "EUR"],
      ["type", "Adjustment"],
      ["importance", "Unclassified"],
      ["category", "Food"],
    ]);
  });

  it("ignores search text and empty values", () => {
    expect(activeTransactionFilters({ q: "coffee", category: "" })).toEqual([]);
  });

  it("clears both ends of the time range together", () => {
    expect(clearTransactionFilter({ from: 1, to: 2, type: "income" }, "time")).toEqual({
      from: undefined,
      to: undefined,
      type: "income",
    });
  });
});
