import { describe, expect, it } from "vitest";
import {
  adjacentImportance,
  inferCategoryImportance,
  sortCategoryCounts,
  summarizeCategoryImportance,
} from "./category-importance";

describe("inferCategoryImportance", () => {
  it("picks each category's most common tier and skips unclassified rows", () => {
    const inferred = inferCategoryImportance([
      { category: "Food", importance: "flexible", count: 3 },
      { category: "Food", importance: "optional", count: 5 },
      { category: "Rent", importance: "fixed", count: "2" },
      { category: "Misc", importance: null, count: 9 },
    ]);
    expect(Object.fromEntries(inferred)).toEqual({ Food: "optional", Rent: "fixed" });
  });
});

describe("sortCategoryCounts", () => {
  it("orders by count, then name", () => {
    expect(
      sortCategoryCounts([
        { category: "B", count: 2 },
        { category: "C", count: 5 },
        { category: "A", count: 2 },
      ]).map((row) => row.category),
    ).toEqual(["C", "A", "B"]);
  });
});

describe("summarizeCategoryImportance", () => {
  it("joins counts, inferred tiers and unclassified counts", () => {
    expect(
      summarizeCategoryImportance({
        categories: [
          { category: "Food", count: 8 },
          { category: "Gifts", count: 1 },
        ],
        unclassified: [{ category: "Food", count: 3 }],
        inferred: new Map([["Food", "optional" as const]]),
      }),
    ).toEqual([
      { category: "Food", count: 8, inferredImportance: "optional", unclassifiedCount: 3 },
      { category: "Gifts", count: 1, inferredImportance: null, unclassifiedCount: 0 },
    ]);
  });
});

describe("adjacentImportance", () => {
  it("wraps around the tiers", () => {
    expect(adjacentImportance("investment", 1)).toBe("fixed");
    expect(adjacentImportance("fixed", -1)).toBe("investment");
    expect(adjacentImportance("fixed", 1)).toBe("flexible");
  });

  it("starts at either end when nothing is picked", () => {
    expect(adjacentImportance(null, 1)).toBe("fixed");
    expect(adjacentImportance(null, -1)).toBe("investment");
  });
});
