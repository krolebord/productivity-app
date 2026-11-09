import {
  type Compilable,
  type CompiledQuery,
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { UserDb } from "./migrations";

/**
 * A query over the user DB as a plain function, so the same query can feed a `useDbQuery` hook
 * (which accepts the function as is), a one-off `db.executeKysely`, or code outside React that
 * needs the compiled SQL (the widget snapshots, which also watch it as a live query).
 */
export type UserDbQuery<Row> = (kysely: Kysely<UserDb>) => Compilable<Row>;

// Only compiles: a query run through it would hit DummyDriver and return nothing.
const compiler = new Kysely<UserDb>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

export function compileUserDbQuery<Row>(query: UserDbQuery<Row>): CompiledQuery<Row> {
  return query(compiler).compile();
}
