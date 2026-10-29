import { createWasmMemoryDriver, SQLiteDbWrapper } from "@sqlite-sync/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserDbDatabase } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";
import { discardNoteIfBlank, type NoteFields, saveNote } from "./notes";

// A plain table standing in for the synced `item` view: these helpers only issue
// ordinary SQL against it.
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

const createNote = (db: UserDbDatabase, id: string, fields: Partial<NoteFields> = {}) =>
  saveNote(db, id, { title: "", content: "", tags: "[]", ...fields }, { draft: true, insertBlank: true });

const rows = (db: UserDbDatabase) =>
  db.executeKysely((q) => q.selectFrom("item").select(["id", "title", "content", "tags", "type"]).orderBy("order"))
    .rows;

describe("note drafts", () => {
  let db: UserDbDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("doesn't insert a new note until it has a title or body", () => {
    expect(saveNote(db, "n1", { title: " ", content: "\n", tags: '["work"]' }, { draft: true })).toBe(false);
    expect(rows(db)).toEqual([]);

    expect(saveNote(db, "n1", { title: "", content: "hello", tags: '["work"]' }, { draft: true })).toBe(true);
    expect(rows(db)).toEqual([{ id: "n1", title: "", content: "hello", tags: '["work"]', type: "note" }]);
  });

  it("updates an existing note even when it becomes blank", () => {
    createNote(db, "n1", { title: "Title" });
    saveNote(db, "n1", { title: "", content: "", tags: "[]" });
    expect(rows(db)).toEqual([{ id: "n1", title: "", content: "", tags: "[]", type: "note" }]);
  });

  it("inserts a blank note when asked to", () => {
    saveNote(db, "n1", { title: "", content: "", tags: "[]" }, { draft: true, insertBlank: true });
    expect(rows(db)).toHaveLength(1);
  });

  it("doesn't recreate a note deleted while its editor was open", () => {
    createNote(db, "n1", { title: "Title" });
    db.executeKysely((q) => q.deleteFrom("item").where("id", "=", "n1"));
    expect(saveNote(db, "n1", { title: "Edited", content: "", tags: "[]" })).toBe(false);
    expect(saveNote(db, "n1", { title: "Edited", content: "", tags: "[]" }, { insertBlank: true })).toBe(false);
    expect(rows(db)).toEqual([]);
  });

  it("discards only blank notes", () => {
    createNote(db, "blank", { title: " ", content: "  \n", tags: '["work"]' });
    createNote(db, "titled", { title: "Keep" });
    createNote(db, "body", { content: "keep" });
    for (const id of ["blank", "titled", "body", "missing"]) discardNoteIfBlank(db, id);
    expect(rows(db).map((row) => row.id)).toEqual(["titled", "body"]);
  });

  it("never discards tasks", () => {
    createNote(db, "t1");
    db.executeKysely((q) => q.updateTable("item").set({ type: "task" }).where("id", "=", "t1"));
    discardNoteIfBlank(db, "t1");
    expect(rows(db)).toHaveLength(1);
  });
});
