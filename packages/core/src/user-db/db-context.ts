import type { SyncedDbDatabase } from "@sqlite-sync/core";
import { createDbContext } from "@sqlite-sync/react";
import { syncDbSchema, type UserDb } from "./migrations";

export const { useDb, DbProvider, useDbQuery, useDbState, useDbEvent } = createDbContext(syncDbSchema);

export type UserDbDatabase = SyncedDbDatabase<UserDb>;
