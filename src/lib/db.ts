import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { getContext } from "./context";
import type { Generated, DB as GeneratedDB } from "./db-types";
import type { MonobankConnectionStatus, MonobankWebhookStatus } from "./monobank/types";

export type UserRole = "user" | "admin";

// Refine the codegen-generated types (which only know these enum columns as `string`) with our
// domain unions. Lives here rather than in db-types.ts, which is regenerated.
type DB = Omit<GeneratedDB, "user" | "monobank_connection"> & {
  user: Omit<GeneratedDB["user"], "role"> & { role: Generated<UserRole> };
  monobank_connection: Omit<GeneratedDB["monobank_connection"], "status" | "webhookStatus"> & {
    status: Generated<MonobankConnectionStatus>;
    webhookStatus: Generated<MonobankWebhookStatus>;
  };
};

export const db = new Kysely<DB>({
  dialect: new D1Dialect({ database: getContext().MAIN_DB }),
});
