import type { UserSyncDbSchema } from "@productivity/core/user-db/migrations";
import type { ServerSyncDb } from "@sqlite-sync/cloudflare";
import { createDefineJob } from "do-jobs";

export type UserDbJobContext = {
  ctx: DurableObjectState;
  env: Env;
  syncDb: ServerSyncDb<UserSyncDbSchema>;
};

export const defineJob = createDefineJob<UserDbJobContext>();
