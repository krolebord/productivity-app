import { createWasmMemoryDriver, SQLiteDbWrapper } from "@sqlite-sync/core";
import { describe, expect, it } from "vitest";
import type { UserDbDatabase } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";
import { conversationTailQuery, olderConversationTailStart } from "./conversations";

// A plain table standing in for the synced `conversation_message` view.
async function createTestDb() {
  const db = new SQLiteDbWrapper<UserDb>({ driver: await createWasmMemoryDriver() });
  db.execute(`create table conversation_message (
    id text primary key, tombstone integer not null default 0, conversationId text not null, seq integer not null,
    role text not null, kind text not null, text text not null default '', toolName text not null default '',
    toolCallId text not null default '', toolState text not null default '', data text not null default '',
    createdAt integer not null
  )`);
  return db as unknown as UserDbDatabase;
}

// Clients can't write this table (the server projects the transcript), so rows go in as plain SQL.
function addMessage(db: UserDbDatabase, id: string, conversationId: string, seq: number) {
  db.execute(
    `insert into conversation_message (id, conversationId, seq, role, kind, text, createdAt)
     values ('${id}', '${conversationId}', ${seq}, 'user', 'text', '${id}', ${seq})`,
  );
}

describe("conversation tail", () => {
  it("reads the end of one conversation, newest first", async () => {
    const db = await createTestDb();
    for (let seq = 1; seq <= 5; seq += 1) addMessage(db, `a${seq}`, "a", seq);
    addMessage(db, "b1", "b", 9);
    // Rows sharing a seq keep a stable order.
    addMessage(db, "a5b", "a", 5);

    const ids = (fromSeq: number | null, pageSize: number) =>
      db.executeKysely(conversationTailQuery("a", fromSeq, pageSize)).rows.map((message) => message.id);
    expect(ids(null, 3)).toEqual(["a5b", "a5", "a4"]);
    expect(ids(null, 10)).toEqual(["a5b", "a5", "a4", "a3", "a2", "a1"]);
  });

  it("keeps a pinned window's oldest messages when newer ones arrive", async () => {
    const db = await createTestDb();
    for (let seq = 1; seq <= 5; seq += 1) addMessage(db, `a${seq}`, "a", seq);
    const ids = () => db.executeKysely(conversationTailQuery("a", 3, 3)).rows.map((message) => message.id);
    expect(ids()).toEqual(["a5", "a4", "a3"]);

    addMessage(db, "a6", "a", 6);
    expect(ids()).toEqual(["a6", "a5", "a4", "a3"]);
  });

  it("moves the window's start back a page at a time until nothing is older", async () => {
    const db = await createTestDb();
    for (let seq = 1; seq <= 5; seq += 1) addMessage(db, `a${seq}`, "a", seq);
    addMessage(db, "b1", "b", 1);

    expect(olderConversationTailStart(db, "a", 5, 2)).toBe(3);
    expect(olderConversationTailStart(db, "a", 3, 5)).toBe(1);
    expect(olderConversationTailStart(db, "a", 1, 2)).toBeNull();
  });
});
