import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { getContext } from "./context";
import type { Generated, DB as GeneratedDB } from "./db-types";

export type UserRole = "user" | "admin";

// Refine the codegen-generated types (which only know `role` as a string) with
// our domain union. Lives here rather than in db-types.ts, which is regenerated.
type DB = Omit<GeneratedDB, "user"> & {
  user: Omit<GeneratedDB["user"], "role"> & { role: Generated<UserRole> };
};

export const db = new Kysely<DB>({
  dialect: new D1Dialect({ database: getContext().MAIN_DB }),
});
