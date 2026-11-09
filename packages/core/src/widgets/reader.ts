import type { CompiledQuery } from "kysely";
import type { UserDbDatabase } from "../user-db/db-context";
import { compileUserDbQuery, type UserDbQuery } from "../user-db/queries";

/** The one thing the snapshot readers need from a DB handle; a test can pass a plain SQLite wrapper. */
export type WidgetDbReader = Pick<UserDbDatabase, "execute">;

export type RecordedQuery = { sql: string; parameters: readonly unknown[] };

export function readRows<Row>(db: WidgetDbReader, query: UserDbQuery<Row> | CompiledQuery<Row>): Row[] {
  const compiled = typeof query === "function" ? compileUserDbQuery(query) : query;
  return db.execute<Row>(compiled).rows;
}

/**
 * Wraps a DB handle so every query a reader runs is recorded. The app watches exactly those
 * queries as live queries to republish when a widget's inputs change, so the set it watches
 * can't drift from what the builders read.
 */
export function recordWidgetQueries(db: WidgetDbReader) {
  const queries = new Map<string, RecordedQuery>();
  const reader: WidgetDbReader = {
    execute: ((query: Parameters<WidgetDbReader["execute"]>[0]) => {
      if (typeof query !== "string") {
        const recorded = { sql: query.sql, parameters: query.parameters };
        queries.set(JSON.stringify(recorded), recorded);
      }
      return db.execute(query);
    }) as WidgetDbReader["execute"],
  };
  return { reader, queries };
}
