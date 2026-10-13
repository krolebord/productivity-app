import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { getContext } from "./context";
import type { Generated, DB as GeneratedDB } from "./db-types";
import type { GoogleCalendarConnectionStatus } from "./google-calendar/types";
import type { McpTokenAccess } from "./mcp-token";
import type { MonobankConnectionStatus, MonobankWebhookStatus } from "./monobank/types";

export type UserRole = "user" | "admin";

// Refine the base table types (which only know these enum columns as `string`) with our
// domain unions. Lives here rather than in db-types.ts, which mirrors the raw SQL schema.
type DB = Omit<GeneratedDB, "user" | "monobank_connection" | "google_calendar_connection" | "mcp_token"> & {
  user: Omit<GeneratedDB["user"], "role"> & { role: Generated<UserRole> };
  monobank_connection: Omit<GeneratedDB["monobank_connection"], "status" | "webhookStatus"> & {
    status: Generated<MonobankConnectionStatus>;
    webhookStatus: Generated<MonobankWebhookStatus>;
  };
  google_calendar_connection: Omit<GeneratedDB["google_calendar_connection"], "status"> & {
    status: Generated<GoogleCalendarConnectionStatus>;
  };
  mcp_token: Omit<GeneratedDB["mcp_token"], "access"> & { access: Generated<McpTokenAccess> };
};

export const db = new Kysely<DB>({
  dialect: new D1Dialect({ database: getContext().MAIN_DB }),
});
