import type { SchemaDocContext } from "@sqlite-sync/ai";

export const userDbSchemaDocContext: SchemaDocContext = {
  overview: [
    "# User database schema",
    "",
    "This is a personal productivity app for notes, financial accounts, and transactions.",
    "All `id` columns are UUIDs and all timestamps (`createdAt`, `updatedAt`, `effectiveAt`)",
    "are unix epoch milliseconds.",
    "When using mutateDb, omit ids for create events; the tool generates them and returns createdIds.",
  ].join("\n"),
};
