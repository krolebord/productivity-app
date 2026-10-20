import { generateId } from "@sqlite-sync/core";
import { type UserDbDatabase, useDbQuery } from "../user-db/db-context";
import type { HabitItem } from "../user-db/migrations";

export type HabitInput = Pick<
  HabitItem,
  | "name"
  | "scheduleType"
  | "scheduleInterval"
  | "scheduleWeekdays"
  | "scheduleMonthDays"
  | "timeOfDay"
  | "target"
  | "unit"
>;

function sortHabits(habits: HabitItem[]) {
  return [...habits].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });
}

export function useHabitsList() {
  const { data } = useDbQuery((q) => q.selectFrom("habit").selectAll().orderBy("order", "asc"), {
    mapData: (habits) => ({ habits: sortHabits(habits), timestamp: Date.now() }),
  });
  return data;
}

export function useHabit(id: string | null) {
  const {
    data: [habit],
  } = useDbQuery((q) =>
    q
      .selectFrom("habit")
      .selectAll()
      .where("id", "=", id ?? ""),
  );
  return habit;
}

export function createHabit(db: UserDbDatabase, input: HabitInput) {
  const id = generateId();
  const now = Date.now();

  db.executeTransaction((trx) => {
    const [maxOrderRow] = trx.executeKysely((q) =>
      q.selectFrom("habit").select((eb) => eb.fn.max("order").as("maxOrder")),
    ).rows;
    const maxOrder = Number(maxOrderRow?.maxOrder ?? 0);

    trx.executeKysely((q) =>
      q.insertInto("habit").values({
        id,
        ...input,
        order: maxOrder + 1,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        tombstone: false,
      }),
    );
  });

  return id;
}

export function updateHabit(db: UserDbDatabase, id: string, input: HabitInput) {
  db.executeKysely((q) =>
    q
      .updateTable("habit")
      .set({ ...input, updatedAt: Date.now() })
      .where("id", "=", id),
  );
}

export function setHabitArchived(db: UserDbDatabase, id: string, archived: boolean) {
  const now = Date.now();
  db.executeKysely((q) =>
    q
      .updateTable("habit")
      .set({
        archivedAt: archived ? now : null,
        updatedAt: now,
      })
      .where("id", "=", id),
  );
}

export function setHabitOrder(db: UserDbDatabase, id: string, order: number) {
  db.executeKysely((q) => q.updateTable("habit").set({ order, updatedAt: Date.now() }).where("id", "=", id));
}

/** Renumbers the given habits 1..n in list order. */
export function reorderHabits(db: UserDbDatabase, orderedIds: readonly string[]) {
  db.executeTransaction((trx) => {
    const now = Date.now();
    orderedIds.forEach((id, i) => {
      trx.executeKysely((q) =>
        q
          .updateTable("habit")
          .set({ order: i + 1, updatedAt: now })
          .where("id", "=", id),
      );
    });
  });
}

/**
 * Writes a habit's value for one day: `existingEntryId` is updated (or deleted when the value
 * drops to 0); otherwise a positive value inserts a new entry.
 */
export function setHabitEntryValue(
  db: UserDbDatabase,
  {
    existingEntryId,
    habitId,
    dateKey,
    value,
  }: { existingEntryId: string | undefined; habitId: string; dateKey: string; value: number },
) {
  const now = Date.now();

  if (existingEntryId) {
    if (value <= 0) {
      db.executeKysely((q) => q.deleteFrom("habit_entry").where("id", "=", existingEntryId));
    } else {
      db.executeKysely((q) =>
        q.updateTable("habit_entry").set({ value, updatedAt: now }).where("id", "=", existingEntryId),
      );
    }
    return;
  }

  if (value <= 0) return;

  db.executeKysely((q) =>
    q.insertInto("habit_entry").values({
      id: generateId(),
      habitId,
      date: dateKey,
      value,
      createdAt: now,
      updatedAt: now,
      tombstone: false,
    }),
  );
}
