import { conversationLastReadCatchUp } from "../conversation-list";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";

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
