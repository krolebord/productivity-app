import { useEffect } from "react";
import { useDb, useDbQuery } from "@/user-db/user-db";

/**
 * Convert dated notes through the synced write path so every replica receives an explicit task kind.
 */
export function LegacyTaskMigration() {
  const db = useDb();
  const { data: legacyTaskIds } = useDbQuery((q) =>
    q.selectFrom("item").select("id").where("type", "=", "note").where("dueAt", "is not", null),
  );

  useEffect(() => {
    if (legacyTaskIds.length === 0) return;

    db.db.executeTransaction((trx) => {
      for (const { id } of legacyTaskIds) {
        trx.executeKysely((q) => q.updateTable("item").set({ type: "task" }).where("id", "=", id));
      }
    });
  }, [db, legacyTaskIds]);

  return null;
}
