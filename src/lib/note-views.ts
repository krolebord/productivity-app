/**
 * Shared helpers for saved note views (the `note_view` table): converting a
 * stored view into /notes search params and matching it against the current
 * ones, used by both the Notes page and the sidebar.
 */

import { parseTags } from "@/lib/tags";
import type { NoteViewItem } from "@/user-db/migrations";

/** The subset of /notes search params a view captures (text query excluded). */
export type NoteViewSearch = {
  tags?: string[];
  not?: string[];
  match?: "any";
};

export function sameTagSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((tag) => set.has(tag));
}

// "all" vs "any" only changes results with 2+ included tags, so filters that
// differ only in a meaningless match mode still count as the same view.
export const effectiveMatch = (include: string[], match: string | undefined): "all" | "any" =>
  include.length >= 2 && match === "any" ? "any" : "all";

/** Search params that apply this view when navigating to /notes. */
export function noteViewSearch(view: NoteViewItem): NoteViewSearch {
  const include = parseTags(view.include);
  const exclude = parseTags(view.exclude);
  return {
    tags: include.length > 0 ? include : undefined,
    not: exclude.length > 0 ? exclude : undefined,
    match: effectiveMatch(include, view.match) === "any" ? "any" : undefined,
  };
}

/** Whether the current /notes search params equal this view's stored filter. */
export function viewMatchesSearch(view: NoteViewItem, search: NoteViewSearch): boolean {
  const include = parseTags(view.include);
  return (
    sameTagSet(search.tags ?? [], include) &&
    sameTagSet(search.not ?? [], parseTags(view.exclude)) &&
    effectiveMatch(search.tags ?? [], search.match) === effectiveMatch(include, view.match)
  );
}
