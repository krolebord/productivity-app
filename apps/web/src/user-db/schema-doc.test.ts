import { syncDbSchema } from "@productivity/core/user-db/migrations";
import { createSchemaDoc } from "@sqlite-sync/ai";
import { describe, expect, it } from "vitest";
import { userDbSchemaDocContext } from "./schema-doc";

// Descriptions should capture non-obvious invariants, not duplicate names and types.
const MAX_SCHEMA_DOC_CHARS = 13_000;

describe("user db schema doc", () => {
  it("stays within the context size budget", () => {
    const doc = createSchemaDoc({
      syncDbSchema,
      context: userDbSchemaDocContext,
    });

    expect(doc.length).toBeGreaterThan(0);
    expect(doc.length).toBeLessThanOrEqual(MAX_SCHEMA_DOC_CHARS);
  });
});
