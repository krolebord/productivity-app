import { useEffect } from "react";
import { useDb, useDbQuery } from "@/user-db/user-db";

/**
 * Dated notes were the app's original task model. Convert them through the
 * synced write path so every replica receives the new explicit item kind.
 * The reactive query also catches legacy rows that arrive after initial sync.
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
