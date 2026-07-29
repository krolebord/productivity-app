import { createSchemaDoc } from "@sqlite-sync/ai";
import { describe, expect, it } from "vitest";
import { syncDbSchema } from "./migrations";
import { userDbSchemaDocContext } from "./schema-doc";

// The schema doc is fed into the assistant agent's context (via getDbSchema) on
// every conversation, so its size directly drives token usage. This test guards
// against the doc growing unexpectedly large — e.g. a verbose `.describe()` or a
// new table — so a sudden jump shows up as a failure to review, not a silent cost.
// `createSchemaDoc` derives the doc from the schema + context alone, with no DB
// access, which is exactly what `getSchemaDoc()` returns at runtime.
// Raised from 16k when the Google Calendar tables (calendar_connection, calendar_source) and the
// item provider columns were added: +1.7k, reviewed and accepted. Moving sync diagnostics out of
// those tables did not win it back — the removed columns were offset by clearer descriptions.
const MAX_SCHEMA_DOC_CHARS = 18_000;

describe("user db schema doc", () => {
  it("stays within the context size budget", () => {
    const doc = createSchemaDoc({
      syncDbSchema,
      context: userDbSchemaDocContext,
    });

    // Sanity check that we measured a real doc, not an empty string.
    expect(doc.length).toBeGreaterThan(0);
    expect(doc.length).toBeLessThanOrEqual(MAX_SCHEMA_DOC_CHARS);
  });
});
