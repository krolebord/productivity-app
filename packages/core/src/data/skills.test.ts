import { createWasmMemoryDriver, SQLiteDbWrapper } from "@sqlite-sync/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserDbDatabase } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";
import { type SkillFields, saveSkill } from "./skills";

// A plain table standing in for the synced `skill` view: these helpers only issue
// ordinary SQL against it.
async function createTestDb() {
  const db = new SQLiteDbWrapper<UserDb>({ driver: await createWasmMemoryDriver() });
  db.execute(`create table skill (
    id text primary key, tombstone integer not null default 0, name text not null default '',
    whenToUse text not null default '', instructions text not null default '', source text not null default 'user',
    status text not null default 'pending', lastUsedAt integer, createdAt integer not null, updatedAt integer not null
  )`);
  return db as unknown as UserDbDatabase;
}

const blank: SkillFields = { name: "", whenToUse: "", instructions: "" };

const rows = (db: UserDbDatabase) =>
  db.executeKysely((q) =>
    q.selectFrom("skill").select(["id", "name", "whenToUse", "instructions", "source", "status"]).orderBy("id"),
  ).rows;

describe("skill drafts", () => {
  let db: UserDbDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("doesn't insert a new skill saved blank", () => {
    expect(saveSkill(db, "s1", { name: " ", whenToUse: "\n", instructions: "" }, { draft: true })).toBe(false);
    expect(rows(db)).toEqual([]);
  });

  it("inserts a new skill once it has content, as an active user skill", () => {
    expect(saveSkill(db, "s1", { ...blank, name: " Weekly review " }, { draft: true })).toBe(true);
    expect(rows(db)).toEqual([
      { id: "s1", name: "Weekly review", whenToUse: "", instructions: "", source: "user", status: "active" },
    ]);
  });

  it("updates an existing skill even when it becomes blank", () => {
    saveSkill(db, "s1", { ...blank, instructions: "Do it" }, { draft: true });
    expect(saveSkill(db, "s1", blank)).toBe(true);
    expect(rows(db)).toEqual([
      { id: "s1", name: "", whenToUse: "", instructions: "", source: "user", status: "active" },
    ]);
  });

  it("doesn't recreate a skill deleted while its editor was open", () => {
    saveSkill(db, "s1", { ...blank, name: "Skill" }, { draft: true });
    db.executeKysely((q) => q.deleteFrom("skill").where("id", "=", "s1"));
    expect(saveSkill(db, "s1", { ...blank, name: "Edited" })).toBe(false);
    expect(rows(db)).toEqual([]);
  });
});
