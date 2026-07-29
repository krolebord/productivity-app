import { createSchemaDoc } from "@sqlite-sync/ai";
import { describe, expect, it } from "vitest";
import { syncDbSchema } from "./migrations";
import { userDbSchemaDocContext } from "./schema-doc";

// The schema document is included in every assistant conversation, so this bounds token cost.
const MAX_SCHEMA_DOC_CHARS = 18_000;

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
