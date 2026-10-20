import { generateId } from "@sqlite-sync/core";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import type { SkillItem } from "../user-db/migrations";

export type SkillRow = Pick<
  SkillItem,
  "id" | "name" | "whenToUse" | "instructions" | "source" | "status" | "createdAt"
>;

export type SkillStatus = SkillItem["status"];

export function useSkills() {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("skill")
      .select(["id", "name", "whenToUse", "instructions", "source", "status", "createdAt"])
      .orderBy("updatedAt", "desc"),
  );
  return data;
}

export function createSkill(db: UserDbDatabase) {
  const id = generateId();
  const now = Date.now();
  db.executeKysely((q) =>
    q.insertInto("skill").values({
      id,
      name: "",
      whenToUse: "",
      instructions: "",
      source: "user",
      status: "active",
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      tombstone: false,
    }),
  );
  return id;
}

export function updateSkill(
  db: UserDbDatabase,
  id: string,
  fields: Pick<SkillItem, "name" | "whenToUse" | "instructions">,
) {
  db.executeKysely((q) =>
    q
      .updateTable("skill")
      .set({
        name: fields.name.trim(),
        whenToUse: fields.whenToUse.trim(),
        instructions: fields.instructions.trim(),
        updatedAt: Date.now(),
      })
      .where("id", "=", id),
  );
}

export function setSkillStatus(db: UserDbDatabase, id: string, status: SkillStatus) {
  db.executeKysely((q) => q.updateTable("skill").set({ status, updatedAt: Date.now() }).where("id", "=", id));
}

export function deleteSkill(db: UserDbDatabase, id: string) {
  db.executeKysely((q) => q.deleteFrom("skill").where("id", "=", id));
}

export function useActiveSkills() {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("skill")
      .select(["id", "name", "whenToUse"])
      .where("status", "=", "active")
      .orderBy("lastUsedAt", "desc")
      .orderBy("createdAt", "desc"),
  );
  return data;
}

export function useSkillStatuses() {
  const { data } = useDbQuery((db) => db.selectFrom("skill").select(["id", "status"]));
  return data;
}

export function useSkill(id: string): Pick<SkillItem, "id" | "name"> | undefined {
  const { data } = useDbQuery((db) => db.selectFrom("skill").select(["id", "name"]).where("id", "=", id).limit(1));
  return data[0];
}

export function markSkillUsed(db: UserDbDatabase, id: string) {
  db.executeKysely((q) => q.updateTable("skill").set({ lastUsedAt: Date.now() }).where("id", "=", id));
}
