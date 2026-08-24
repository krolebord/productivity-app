import { verifySyncSchema } from "@sqlite-sync/core";
import { describe, expect, it } from "vitest";
import { syncDbSchema } from "./migrations";

describe("user db schema", () => {
  it("migrations produce the declared schema", async () => {
    expect(await verifySyncSchema(syncDbSchema)).toEqual([]);
  });

  it("applies agent access and backup policies", () => {
    expect(syncDbSchema.tables.conversation.aiAccess).toBe("read-write");
    expect(syncDbSchema.tables.conversation_message.aiAccess).toBe("read-only");
    expect(syncDbSchema.tables.currency_rate.exportImport).toBe("ignore");
    expect(syncDbSchema.tables.conversation.exportImport).toBe("ignore");
    expect(syncDbSchema.tables.conversation_message.exportImport).toBe("ignore");
    expect(syncDbSchema.tables.monobank_connection.exportImport).toBe("ignore");
    expect(syncDbSchema.tables.monobank_account.exportImport).toBe("ignore");
    expect(syncDbSchema.tables.calendar_connection.exportImport).toBe("ignore");
    expect(syncDbSchema.tables.calendar_source.exportImport).toBe("ignore");
  });
});
