import { generateId } from "@sqlite-sync/core";
import { format } from "date-fns";
import { parseDateKey } from "../agenda";
import { combineLocalDateAndTime, localMidnightMs } from "../date-time";
import { DETACHED_PROVIDER_TYPE } from "../google-calendar/mapping";
import { parseTags } from "../tags";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import { nextItemOrder } from "./items";

export function useTaskTagSuggestions() {
  const { data } = useDbQuery((q) => q.selectFrom("item").select("tags"), {
    mapData: (rows) => {
      const set = new Set<string>();
      for (const row of rows) {
        for (const tag of parseTags(row.tags)) set.add(tag);
      }
      return Array.from(set).sort();
    },
  });
  return data;
}

export function createTask(
  db: UserDbDatabase,
  { title = "", dueAt = null }: { title?: string; dueAt?: number | null } = {},
) {
  const id = generateId();
  const createdAt = Date.now();

  db.executeTransaction((trx) => {
    const order = nextItemOrder(trx, "task");

    trx.executeKysely((q) =>
      q.insertInto("item").values({
        id,
        type: "task",
        title,
        content: "",
        order,
        createdAt,
        tags: "[]",
        dueAt,
        hasDueTime: false,
        completedAt: null,
        tombstone: false,
      }),
    );
  });

  return id;
}

export function setTaskCompleted(db: UserDbDatabase, id: string, completed: boolean) {
  db.executeKysely((q) =>
    q
      .updateTable("item")
      .set({ completedAt: completed ? Date.now() : null })
      .where("id", "=", id),
  );
}

/** Moves a task to `dueAt`, keeping its all-day/timed flag; reopens it unless `completed`. */
export function rescheduleTask(db: UserDbDatabase, id: string, dueAt: number, { completed = false } = {}) {
  db.executeKysely((q) =>
    q
      .updateTable("item")
      .set({ dueAt, completedAt: completed ? Date.now() : null })
      .where("id", "=", id),
  );
}

/** Schedules a task as an all-day task at `dueAt`, optionally completing it at the same time. */
export function scheduleAllDayTask(db: UserDbDatabase, id: string, dueAt: number, { completed = false } = {}) {
  db.executeKysely((q) =>
    q
      .updateTable("item")
      .set({ dueAt, hasDueTime: false, completedAt: completed ? Date.now() : null })
      .where("id", "=", id),
  );
}

/**
 * Unlink a mirrored task from its calendar event. `providerId` stays put so the sync job still
 * recognises the event and never re-imports it; the task becomes an ordinary local one.
 */
export function detachTaskFromCalendar(db: UserDbDatabase, id: string) {
  db.executeKysely((q) => q.updateTable("item").set({ providerType: DETACHED_PROVIDER_TYPE }).where("id", "=", id));
}

/** Schedules a task on the given day; a note is converted into a task first. */
export function scheduleItemOnDay(db: UserDbDatabase, itemId: string, dateKey: string) {
  db.executeTransaction((trx) => {
    const [item] = trx.executeKysely((q) =>
      q.selectFrom("item").select(["type", "dueAt", "hasDueTime"]).where("id", "=", itemId),
    ).rows;
    if (!item) return;

    const day = parseDateKey(dateKey);
    if (item.type === "note") {
      trx.executeKysely((q) =>
        q
          .updateTable("item")
          .set({ type: "task", dueAt: localMidnightMs(day), hasDueTime: false, completedAt: null })
          .where("id", "=", itemId),
      );
      return;
    }

    const dueAt =
      item.hasDueTime && item.dueAt != null
        ? combineLocalDateAndTime(day, format(item.dueAt, "HH:mm"))
        : localMidnightMs(day);
    trx.executeKysely((q) => q.updateTable("item").set({ type: "task", dueAt }).where("id", "=", itemId));
  });
}

/** Unschedules an item into the inbox; a note becomes an undated task. */
export function moveItemToInbox(db: UserDbDatabase, itemId: string) {
  db.executeTransaction((trx) => {
    const order = nextItemOrder(trx, "task");
    trx.executeKysely((q) =>
      q
        .updateTable("item")
        .set({
          type: "task",
          dueAt: null,
          hasDueTime: false,
          completedAt: null,
          order,
        })
        .where("id", "=", itemId),
    );
  });
}
