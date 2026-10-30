import { createWasmMemoryDriver, SQLiteDbWrapper } from "@sqlite-sync/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserDbDatabase } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";
import { discardTaskIfBlank, saveTask, type TaskFields } from "./tasks";

// A plain table standing in for the synced `item` view (see notes.test.ts).
async function createTestDb() {
  const db = new SQLiteDbWrapper<UserDb>({ driver: await createWasmMemoryDriver() });
  db.execute(`create table item (
    id text primary key, tombstone integer not null default 0, type text not null default 'note',
    title text not null, createdAt integer not null, content text default '', "order" real default 0,
    tags text not null default '[]', dueAt integer, hasDueTime integer not null default 0, completedAt integer,
    providerType text, providerId text, providerUpdatedAt integer
  )`);
  return db as unknown as UserDbDatabase;
}

const blank: TaskFields = { title: "", content: "", tags: "[]", dueAt: null, hasDueTime: false, completedAt: null };

const rows = (db: UserDbDatabase) =>
  db.executeKysely((q) =>
    q.selectFrom("item").select(["id", "title", "type", "dueAt", "order"]).orderBy("order").orderBy("id"),
  ).rows;

describe("task drafts", () => {
  let db: UserDbDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("doesn't insert a new task until it has a title or details", () => {
    expect(saveTask(db, "t1", { ...blank, dueAt: 1000, tags: '["work"]' }, { draft: true })).toBe(false);
    expect(rows(db)).toEqual([]);

    expect(saveTask(db, "t1", { ...blank, title: "Buy milk", dueAt: 1000 }, { draft: true })).toBe(true);
    expect(rows(db)).toEqual([{ id: "t1", title: "Buy milk", type: "task", dueAt: 1000, order: 1 }]);
  });

  it("appends new tasks after existing ones", () => {
    saveTask(db, "t1", { ...blank, title: "One" }, { draft: true });
    saveTask(db, "t2", { ...blank, title: "Two" }, { draft: true });
    expect(rows(db).map((row) => [row.id, row.order])).toEqual([
      ["t1", 1],
      ["t2", 2],
    ]);
  });

  it("doesn't recreate a task deleted while its editor was open", () => {
    saveTask(db, "t1", { ...blank, title: "One" }, { draft: true });
    db.executeKysely((q) => q.deleteFrom("item").where("id", "=", "t1"));
    expect(saveTask(db, "t1", { ...blank, title: "Edited" })).toBe(false);
    expect(rows(db)).toEqual([]);
  });

  it("discards only blank tasks", () => {
    saveTask(db, "blank", { ...blank, dueAt: 1000 }, { draft: true, insertBlank: true });
    saveTask(db, "titled", { ...blank, title: "Keep" }, { draft: true });
    for (const id of ["blank", "titled", "missing"]) discardTaskIfBlank(db, id);
    expect(rows(db).map((row) => row.id)).toEqual(["titled"]);
  });

  it("never discards notes", () => {
    db.executeKysely((q) =>
      q.insertInto("item").values({ id: "n1", type: "note", title: "", tags: "[]", createdAt: 0, hasDueTime: false }),
    );
    discardTaskIfBlank(db, "n1");
    expect(rows(db)).toHaveLength(1);
  });
});
