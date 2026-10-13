import type { SchemaDocContext } from "@sqlite-sync/ai";

export const userDbSchemaDocContext: SchemaDocContext = {
  overview: [
    "# User database schema",
    "",
    "This is a personal productivity app for notes, tasks, habits, financial accounts, and transactions.",
    "All `id` columns are UUIDs and all timestamps (`createdAt`, `updatedAt`, `lastReadAt`, `effectiveAt`)",
    "are unix epoch milliseconds.",
    "Money columns are in their row's or account's currency. Never sum or compare amounts across currencies:",
    "group by currency, or convert via `currency_rate` first.",
  ].join("\n"),
};
