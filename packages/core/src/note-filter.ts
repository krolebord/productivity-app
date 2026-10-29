/**
 * Tag filtering for the notes list, shared by the web Notes page and the mobile
 * Notes tab: include tags matched as "all" or "any", excluded tags always hide a
 * note, and notes without tags match the UNTAGGED pseudo-tag.
 */

import { parseTags, UNTAGGED } from "./tags";

export type TagFilter = { include: string[]; exclude: string[]; match: "all" | "any" };

type TaggedNote = { tags: string };

export function noteFilterTags(note: TaggedNote): string[] {
  const tags = parseTags(note.tags);
  return tags.length > 0 ? tags : [UNTAGGED];
}

export function matchesTagFilter(note: TaggedNote, filter: TagFilter, ignoreExcluded?: string): boolean {
  const tags = noteFilterTags(note);
  if (filter.exclude.some((tag) => tag !== ignoreExcluded && tags.includes(tag))) return false;
  if (filter.include.length === 0) return true;
  return filter.match === "all"
    ? filter.include.every((tag) => tags.includes(tag))
    : filter.include.some((tag) => tags.includes(tag));
}

/** Every tag the filter can offer, alphabetically with UNTAGGED last; active filter tags stay listed. */
export function filterTagOptions(notes: readonly TaggedNote[], filter: Pick<TagFilter, "include" | "exclude">) {
  const set = new Set<string>();
  for (const note of notes) {
    for (const tag of noteFilterTags(note)) set.add(tag);
  }
  for (const tag of [...filter.include, ...filter.exclude]) set.add(tag);
  const hasUntagged = set.delete(UNTAGGED);
  const sorted = [...set].sort((a, b) => a.localeCompare(b));
  if (hasUntagged) sorted.push(UNTAGGED);
  return sorted;
}

/**
 * How many notes each tag's filter option stands for: for an excluded tag, the notes it
 * hides; for a tag that would widen an "any" filter, the notes it alone would show;
 * otherwise the currently shown notes that carry it.
 */
export function filterTagCounts(notes: readonly TaggedNote[], filter: TagFilter, tags: readonly string[]) {
  const shown = notes.filter((note) => matchesTagFilter(note, filter));
  const counts = new Map<string, number>();
  for (const tag of tags) {
    let count: number;
    if (filter.exclude.includes(tag)) {
      count = notes.filter((note) => noteFilterTags(note).includes(tag) && matchesTagFilter(note, filter, tag)).length;
    } else if (filter.match === "any" && filter.include.length > 0 && !filter.include.includes(tag)) {
      const alone: TagFilter = { include: [tag], exclude: filter.exclude, match: "any" };
      count = notes.filter((note) => matchesTagFilter(note, alone)).length;
    } else {
      count = shown.filter((note) => noteFilterTags(note).includes(tag)).length;
    }
    counts.set(tag, count);
  }
  return counts;
}
