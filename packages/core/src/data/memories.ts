import { generateId } from "@sqlite-sync/core";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import type { MemoryItem } from "../user-db/migrations";

export type MemoryRow = Pick<MemoryItem, "id" | "content" | "source" | "enabled" | "createdAt">;

export function useMemories() {
  const { data } = useDbQuery((db) =>
    db.selectFrom("memory").select(["id", "content", "source", "enabled", "createdAt"]).orderBy("createdAt", "desc"),
  );
  return data;
}

export function createMemory(db: UserDbDatabase, content: string) {
  const now = Date.now();
  db.executeKysely((q) =>
    q.insertInto("memory").values({
      id: generateId(),
      content,
      source: "user",
      enabled: true,
      createdAt: now,
      updatedAt: now,
      tombstone: false,
    }),
  );
}

export function updateMemoryContent(db: UserDbDatabase, id: string, content: string) {
  db.executeKysely((q) => q.updateTable("memory").set({ content, updatedAt: Date.now() }).where("id", "=", id));
}

export function setMemoryEnabled(db: UserDbDatabase, id: string, enabled: boolean) {
  db.executeKysely((q) => q.updateTable("memory").set({ enabled, updatedAt: Date.now() }).where("id", "=", id));
}

export function deleteMemory(db: UserDbDatabase, id: string) {
  db.executeKysely((q) => q.deleteFrom("memory").where("id", "=", id));
}

export function useMemoryEnabledStates() {
  const { data } = useDbQuery((db) => db.selectFrom("memory").select(["id", "enabled"]));
  return data;
}
