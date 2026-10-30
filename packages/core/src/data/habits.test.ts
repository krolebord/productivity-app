import { createWasmMemoryDriver, SQLiteDbWrapper } from "@sqlite-sync/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserDbDatabase } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";
import { deleteArchivedHabit } from "./habits";

// Plain tables standing in for the synced `habit`/`habit_entry` views (see notes.test.ts).
async function createTestDb() {
  const db = new SQLiteDbWrapper<UserDb>({ driver: await createWasmMemoryDriver() });
  db.execute("create table habit (id text primary key, name text not null, archivedAt integer)");
  db.execute("create table habit_entry (id text primary key, habitId text not null, date text not null)");
  db.execute(`insert into habit values ('active', 'Read', null), ('archived', 'Run', 1000)`);
  db.execute(`insert into habit_entry values
    ('e1', 'active', '2026-10-01'), ('e2', 'archived', '2026-10-01'), ('e3', 'archived', '2026-10-02')`);
  return db as unknown as UserDbDatabase;
}

const ids = (db: UserDbDatabase, table: "habit" | "habit_entry") =>
  db.executeKysely((q) => q.selectFrom(table).select("id").orderBy("id")).rows.map((row) => row.id);

describe("deleteArchivedHabit", () => {
  let db: UserDbDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("deletes an archived habit with its entries", () => {
    expect(deleteArchivedHabit(db, "archived")).toBe(true);
    expect(ids(db, "habit")).toEqual(["active"]);
    expect(ids(db, "habit_entry")).toEqual(["e1"]);
  });

  it("leaves habits that aren't archived alone", () => {
    expect(deleteArchivedHabit(db, "active")).toBe(false);
    expect(deleteArchivedHabit(db, "missing")).toBe(false);
    expect(ids(db, "habit")).toEqual(["active", "archived"]);
    expect(ids(db, "habit_entry")).toEqual(["e1", "e2", "e3"]);
  });
});
