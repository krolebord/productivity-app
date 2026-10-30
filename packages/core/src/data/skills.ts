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

export type SkillFields = Pick<SkillItem, "name" | "whenToUse" | "instructions">;

/** A skill with no name, trigger or instructions. */
export const isBlankSkill = (fields: SkillFields) =>
  !fields.name.trim() && !fields.whenToUse.trim() && !fields.instructions.trim();

/**
 * Saves the skill editor's fields and returns whether the skill's row exists afterwards.
 * "New skill" opens the editor on a fresh id without a row (`draft`), and the row is only
 * inserted when it's saved with some content, so cancelling (or saving it blank) leaves
 * nothing behind to be offered to the assistant. Outside a draft a missing row means the
 * skill was deleted, e.g. on another device, and saving doesn't bring it back.
 */
export function saveSkill(
  db: UserDbDatabase,
  id: string,
  fields: SkillFields,
  { draft = false }: { draft?: boolean } = {},
): boolean {
  const values = {
    name: fields.name.trim(),
    whenToUse: fields.whenToUse.trim(),
    instructions: fields.instructions.trim(),
    updatedAt: Date.now(),
  };
  return db.executeTransaction((trx) => {
    const [existing] = trx.executeKysely((q) => q.selectFrom("skill").select("id").where("id", "=", id)).rows;
    if (existing) {
      trx.executeKysely((q) => q.updateTable("skill").set(values).where("id", "=", id));
      return true;
    }
    if (!draft || isBlankSkill(values)) return false;

    trx.executeKysely((q) =>
      q.insertInto("skill").values({
        ...values,
        id,
        source: "user",
        status: "active",
        lastUsedAt: null,
        createdAt: values.updatedAt,
        tombstone: false,
      }),
    );
    return true;
  });
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
