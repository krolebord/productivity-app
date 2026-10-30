import { createWasmMemoryDriver, SQLiteDbWrapper } from "@sqlite-sync/core";
import { describe, expect, it } from "vitest";
import type { UserDbDatabase } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";
import { containsPattern, matchingItemsQuery, SEARCH_RESULT_LIMIT } from "./search";

describe("containsPattern", () => {
  it("matches the trimmed query anywhere", () => {
    expect(containsPattern("  milk ")).toBe("%milk%");
  });

  it("is null for a blank query", () => {
    expect(containsPattern("   ")).toBeNull();
  });

  it("escapes LIKE wildcards and the escape character", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("containsPattern in SQLite", () => {
  it("matches wildcards literally and ignores ASCII case", async () => {
    const db = new SQLiteDbWrapper<Record<string, never>>({ driver: await createWasmMemoryDriver() });
    db.execute("create table t (v text)");
    db.execute("insert into t values ('50% off'), ('500 off'), ('Buy MILK')");
    const match = (query: string) =>
      db
        .execute<{ v: string }>({
          sql: "select v from t where v like ? escape '\\' order by v",
          parameters: [containsPattern(query)],
        })
        .rows.map((row) => row.v);
    expect(match("0%")).toEqual(["50% off"]);
    expect(match("milk")).toEqual(["Buy MILK"]);
  });
});

describe("matchingItemsQuery", () => {
  it("limits notes and tasks separately, so newer notes don't hide tasks", async () => {
    const db = new SQLiteDbWrapper<UserDb>({ driver: await createWasmMemoryDriver() });
    db.execute(`create table item (
      id text primary key, type text not null, title text not null, content text, tags text not null default '[]',
      createdAt integer not null
    )`);
    db.execute("insert into item values ('t1', 'task', 'milk task', '', '[]', 1)");
    for (let i = 0; i < SEARCH_RESULT_LIMIT * 3; i++) {
      db.execute(`insert into item values ('n${i}', 'note', 'milk note', '', '[]', ${100 + i})`);
    }
    const userDb = db as unknown as UserDbDatabase;
    const search = (type: "note" | "task") =>
      userDb.executeKysely((q) => matchingItemsQuery(q, type, containsPattern("milk"))).rows.map((row) => row.id);

    expect(search("task")).toEqual(["t1"]);
    expect(search("note")).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(search("note")[0]).toBe(`n${SEARCH_RESULT_LIMIT * 3 - 1}`);
  });
});
