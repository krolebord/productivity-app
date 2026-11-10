import {
  createMigrator,
  createStoredValue,
  createWasmMemoryDriver,
  type MigrationsDb,
  SQLiteDbWrapper,
  verifySyncSchema,
} from "@sqlite-sync/core";
import { describe, expect, it } from "vitest";
import { setConversationPinned } from "../data/conversations";
import type { UserDbDatabase } from "./db-context";
import { syncDbSchema } from "./migrations";

describe("user db schema", () => {
  it("migrations produce the declared schema", async () => {
    expect(await verifySyncSchema(syncDbSchema)).toEqual([]);
  });

  it("upgrades existing conversations as unpinned without changing activity or read receipts", async () => {
    const db = new SQLiteDbWrapper({ driver: await createWasmMemoryDriver() });
    const schemaVersion = createStoredValue({ initialValue: -1 });
    const adapter: MigrationsDb = {
      startTransaction: (callback) =>
        db.executeTransaction((tx) =>
          callback({
            execute: (sql, parameters) => {
              tx.execute({ sql, parameters });
            },
          }),
        ),
    };
    try {
      const priorMigrations = Object.fromEntries(
        Object.entries(syncDbSchema.migrations).filter(([version]) => Number(version) < 28),
      );
      createMigrator({ migrations: priorMigrations, schemaVersion }).migrateDbToLatest(adapter);
      db.execute(
        `insert into _conversation (id, title, createdAt, updatedAt, lastReadAt) values ('existing', 'Ongoing', 10, 20, 15)`,
      );
      createMigrator({ migrations: syncDbSchema.migrations, schemaVersion }).migrateDbToLatest(adapter);
      const read = () =>
        db.execute(`select title, pinned, updatedAt, lastReadAt from _conversation where id = 'existing'`).rows[0];
      expect(read()).toEqual({ title: "Ongoing", pinned: 0, updatedAt: 20, lastReadAt: 15 });
      // The synced view is normally installed by the DB bootstrap, separately from migrations.
      db.execute(`create view conversation as select * from _conversation where tombstone = 0`);
      db.execute(`create trigger conversation_update instead of update on conversation begin
        update _conversation set pinned = new.pinned, updatedAt = new.updatedAt, lastReadAt = new.lastReadAt where id = old.id;
      end`);
      setConversationPinned(db as unknown as UserDbDatabase, "existing", true);
      expect(read()).toEqual({ title: "Ongoing", pinned: 1, updatedAt: 20, lastReadAt: 15 });
      db.execute(`insert into _conversation (id, createdAt, updatedAt) values ('older-client', 30, 30)`);
      expect(db.execute(`select pinned from _conversation where id = 'older-client'`).rows[0]).toEqual({ pinned: 0 });
    } finally {
      db.close();
    }
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
