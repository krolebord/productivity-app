import { IMPORTANCE_TIERS, type ImportanceTier } from "../transactions";

/**
 * Category importance defaults: an expense category's default tier is whichever tier most of
 * its classified expenses already use. The transaction editors pre-fill it, and the
 * classification dialog backfills and changes it.
 */

type CountRow = { category: string; count: number | string | bigint };
type ImportanceCountRow = CountRow & { importance: string | null };

/** The most common tier per category; categories without classified expenses are absent. */
export function inferCategoryImportance(rows: readonly ImportanceCountRow[]): Map<string, ImportanceTier> {
  const best = new Map<string, { importance: ImportanceTier; count: number }>();
  for (const row of rows) {
    if (!row.importance) continue;
    const count = Number(row.count);
    const current = best.get(row.category);
    if (!current || count > current.count) {
      best.set(row.category, { importance: row.importance as ImportanceTier, count });
    }
  }
  return new Map([...best].map(([category, value]) => [category, value.importance] as const));
}

export type CategoryCount = { category: string; count: number };

/** Largest categories first, ties alphabetically. */
export function sortCategoryCounts(rows: readonly CountRow[]): CategoryCount[] {
  return rows
    .map((row) => ({ category: row.category, count: Number(row.count) }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export type CategoryImportanceSummary = CategoryCount & {
  inferredImportance: ImportanceTier | null;
  unclassifiedCount: number;
};

/** Every expense category with its inferred default and how many of its expenses lack a tier. */
export function summarizeCategoryImportance({
  categories,
  unclassified,
  inferred,
}: {
  categories: readonly CategoryCount[];
  unclassified: readonly CategoryCount[];
  inferred: ReadonlyMap<string, ImportanceTier>;
}): CategoryImportanceSummary[] {
  const unclassifiedByCategory = new Map(unclassified.map((row) => [row.category, row.count] as const));
  return categories.map((row) => ({
    ...row,
    inferredImportance: inferred.get(row.category) ?? null,
    unclassifiedCount: unclassifiedByCategory.get(row.category) ?? 0,
  }));
}

/** Steps through the tiers, wrapping around; with nothing picked it starts at either end. */
export function adjacentImportance(current: ImportanceTier | null, direction: -1 | 1): ImportanceTier {
  if (!current) {
    return direction > 0 ? IMPORTANCE_TIERS[0] : IMPORTANCE_TIERS[IMPORTANCE_TIERS.length - 1];
  }
  const index = IMPORTANCE_TIERS.indexOf(current);
  return IMPORTANCE_TIERS[(index + direction + IMPORTANCE_TIERS.length) % IMPORTANCE_TIERS.length];
}

/** Show the classification prompt once more than this many categorized expenses lack a tier. */
export const IMPORTANCE_PROMPT_THRESHOLD = 5;
