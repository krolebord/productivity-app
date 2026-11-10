import type { Kysely } from "kysely";
import { useCallback, useState } from "react";
import { conversationLastReadCatchUp } from "../conversation-list";
import { type UserDbDatabase, useDb, useDbQuery } from "../user-db/db-context";
import type { UserDb } from "../user-db/migrations";

export function useConversations() {
  const { data } = useDbQuery((db) => db.selectFrom("conversation").selectAll().orderBy("updatedAt", "desc"));
  return data;
}

/** Includes deleted conversations, so usage stats can cover all-time spend. */
export function useConversationUsage() {
  const { data } = useDbQuery((db) =>
    db.selectFrom("_conversation").select(["id", "tombstone", "model", "totalCost", "totalTokens"]),
  );
  return data;
}

export function useConversationTurnStatuses() {
  const { data } = useDbQuery((db) => db.selectFrom("conversation").select(["id", "turnStatus", "updatedAt"]));
  return data;
}

export function useConversationMessages(conversationId: string) {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("conversation_message")
      .selectAll()
      .where("conversationId", "=", conversationId)
      .orderBy("seq", "asc")
      .orderBy("id", "asc"),
  );
  return data;
}

/**
 * The end of a conversation, newest first: its newest `pageSize` messages, or every message
 * from `fromSeq` on once the window's start is pinned.
 */
export const conversationTailQuery =
  (conversationId: string, fromSeq: number | null, pageSize: number) => (db: Kysely<UserDb>) => {
    const query = db
      .selectFrom("conversation_message")
      .selectAll()
      .where("conversationId", "=", conversationId)
      .orderBy("seq", "desc")
      .orderBy("id", "desc");
    return fromSeq === null ? query.limit(pageSize) : query.where("seq", ">=", fromSeq);
  };

/** The `seq` a window starting at `fromSeq` moves back to for one more page, or null when nothing is older. */
export function olderConversationTailStart(
  db: UserDbDatabase,
  conversationId: string,
  fromSeq: number,
  pageSize: number,
): number | null {
  const { rows } = db.executeKysely((q) =>
    q
      .selectFrom("conversation_message")
      .select("seq")
      .where("conversationId", "=", conversationId)
      .where("seq", "<", fromSeq)
      .orderBy("seq", "desc")
      .limit(pageSize),
  );
  return rows[rows.length - 1]?.seq ?? null;
}

/**
 * The end of a conversation, newest first (the order a bottom-anchored list takes), with
 * `loadOlder` to extend it one page back. A transcript is re-read on every streamed update,
 * so a chat reads its tail rather than all of it.
 *
 * The window starts at a message, not a count from the end: once a full page is loaded its
 * oldest message is pinned, so replies arriving later extend the window instead of pushing
 * out the oldest messages, which the user may be reading.
 */
export function useConversationTail(conversationId: string, pageSize: number) {
  const db = useDb();
  const [pinned, setPinned] = useState<{ conversationId: string; fromSeq: number } | null>(null);
  const fromSeq = pinned?.conversationId === conversationId ? pinned.fromSeq : null;
  const { data: messages } = useDbQuery(conversationTailQuery(conversationId, fromSeq, pageSize));

  // Fewer than a page is the whole conversation so far; nothing can be pushed out of it yet.
  const oldestSeq = messages[messages.length - 1]?.seq;
  if (fromSeq === null && oldestSeq !== undefined && messages.length >= pageSize) {
    setPinned({ conversationId, fromSeq: oldestSeq });
  }

  const loadOlder = useCallback(() => {
    if (fromSeq === null) return;
    const olderStart = olderConversationTailStart(db.db, conversationId, fromSeq, pageSize);
    if (olderStart !== null) setPinned({ conversationId, fromSeq: olderStart });
  }, [db, conversationId, fromSeq, pageSize]);

  return { messages, loadOlder };
}

/** Whether the message exists yet, wherever it sits in its conversation. */
export function useConversationMessageExists(messageId: string | null | undefined) {
  const { data } = useDbQuery((db) =>
    db
      .selectFrom("conversation_message")
      .select("id")
      .where("id", "=", messageId ?? "")
      .limit(1),
  );
  return data.length > 0;
}

export function useConversationMessageIds() {
  const { data } = useDbQuery((db) => db.selectFrom("conversation_message").select(["id"]));
  return data;
}

/**
 * Turn start per conversation. The agent writes the user row with the turn's
 * timestamp immediately before flipping turnStatus to running, so the newest
 * user message is when the current turn began.
 */
export function useConversationTurnStarts() {
  const { data } = useDbQuery(
    (db) =>
      db
        .selectFrom("conversation_message")
        .select((eb) => ["conversationId", eb.fn.max("createdAt").as("startedAt")])
        .where("role", "=", "user")
        .groupBy("conversationId"),
    {
      mapData: (rows) => new Map(rows.map((row) => [row.conversationId, Number(row.startedAt ?? 0)])),
    },
  );
  return data;
}

/** Stamp lastReadAt to updatedAt when the row is behind. No-ops on missing drafts. */
export function catchUpConversationLastRead(db: UserDbDatabase, id: string) {
  const { rows } = db.executeKysely((q) =>
    q.selectFrom("conversation").select(["updatedAt", "lastReadAt"]).where("id", "=", id).limit(1),
  );
  const lastReadAt = conversationLastReadCatchUp(rows[0]);
  if (lastReadAt == null) return;
  db.executeKysely((q) => q.updateTable("conversation").set({ lastReadAt }).where("id", "=", id));
}

export function deleteConversation(db: UserDbDatabase, id: string) {
  db.executeKysely((q) => q.deleteFrom("conversation").where("id", "=", id));
}

/** Pin metadata does not change activity or read receipts. */
export function setConversationPinned(db: UserDbDatabase, id: string, pinned: boolean) {
  db.executeKysely((q) => q.updateTable("conversation").set({ pinned }).where("id", "=", id));
}
