import { syncDbSchema, type UserDbProps } from "@productivity/core/user-db/migrations";
import { createSyncedDb } from "@sqlite-sync/core";

export async function initUserDb({ userId }: { userId: string }) {
  const worker = new Worker(new URL("./user-worker.ts", import.meta.url), {
    type: "module",
  });
  const db = await createSyncedDb({
    dbId: `user-${userId}`,
    worker,
    syncDbSchema,
    workerProps: { userId } as UserDbProps,
  });

  return db;
}
