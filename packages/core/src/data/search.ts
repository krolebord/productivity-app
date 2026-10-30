import { type Expression, type SqlBool, sql } from "kysely";
import { markdownToPlainText } from "../note-text";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import type { NoteItem } from "../user-db/migrations";

export const SEARCH_RESULT_LIMIT = 20;

/**
 * A LIKE pattern matching `query` anywhere, with `%`, `_` and the escape character itself
 * taken literally (pair it with `ESCAPE '\'`). Returns null for a blank query.
 */
export function containsPattern(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** `column LIKE pattern ESCAPE '\'`, case-insensitive for ASCII like every SQLite LIKE. */
function likeEscaped(column: string, pattern: string): Expression<SqlBool> {
  return sql<SqlBool>`${sql.ref(column)} like ${pattern} escape '\\'`;
}

const NO_MATCH = sql<SqlBool>`0`;

/** Up to `limit` characters of a note or task body as plain text, for result previews. */
export function searchPreview(content: string | null | undefined, limit = 120): string {
  return content ? markdownToPlainText(content, limit) : "";
}

type ItemQueryCreator = Parameters<Parameters<UserDbDatabase["executeKysely"]>[0]>[0];

/** The newest notes or tasks (`type`) whose title, body or tags contain `pattern`. */
export function matchingItemsQuery(q: ItemQueryCreator, type: NoteItem["type"], pattern: string | null) {
  return q
    .selectFrom("item")
    .selectAll()
    .where("type", "=", type)
    .where((eb) =>
      pattern
        ? eb.or([likeEscaped("title", pattern), likeEscaped("content", pattern), likeEscaped("tags", pattern)])
        : NO_MATCH,
    )
    .orderBy("createdAt", "desc")
    .limit(SEARCH_RESULT_LIMIT);
}

/**
 * Notes, tasks and transactions matching `query` in their text: an item's title, body or
 * tags, a transaction's title, category or notes. The newest come first, each group capped
 * at SEARCH_RESULT_LIMIT. A blank query matches nothing.
 */
export function useGlobalSearch(query: string) {
  const pattern = containsPattern(query);

  // One query per type, so a burst of matching notes can't crowd the tasks out of the limit.
  const { data: notes } = useDbQuery((q) => matchingItemsQuery(q, "note", pattern));
  const { data: tasks } = useDbQuery((q) => matchingItemsQuery(q, "task", pattern));

  const { data: transactions } = useDbQuery((q) =>
    q
      .selectFrom("transaction_entry")
      .selectAll()
      .where((eb) =>
        pattern
          ? eb.or([likeEscaped("title", pattern), likeEscaped("category", pattern), likeEscaped("notes", pattern)])
          : NO_MATCH,
      )
      .orderBy("effectiveAt", "desc")
      .limit(SEARCH_RESULT_LIMIT),
  );

  return { notes, tasks, transactions };
}
