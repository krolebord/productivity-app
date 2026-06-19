/**
 * Tags are stored on a note as a JSON array of normalized strings in the
 * `item.tags` column. Normalization keeps the set tidy (no near-duplicates
 * like "Work" / "work " / "side project" vs "side-project").
 */

/** Lowercase, trim, slugify whitespace, and strip a leading "#". */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parse the stored JSON column into a deduped list of tag strings. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const tag = item.trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
    return out;
  } catch {
    return [];
  }
}

/** Serialize a tag list back into the stored JSON column format. */
export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}
