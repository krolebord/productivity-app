import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useState } from "react";
import { useDb, useDbQuery } from "@/user-db/user-db";

/**
 * One reading of "the accounts, in order" plus one reordering rule, shared by
 * every surface that lists accounts (sidebar, overview card). Both used to keep
 * their own copy, and their drag gestures disagreed: one swapped the two rows'
 * order values, the other inserted the dragged row at its new index.
 */
export function useAccounts() {
  const { data } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"));
  return data;
}

/**
 * Accounts plus a drag handler that inserts the dragged account at its drop
 * index. Reordering paints from local state until the query catches up,
 * otherwise the row snaps back to its old slot for a frame.
 */
export function useReorderableAccounts() {
  const db = useDb();

  const { data: list } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"), {
    mapData: (accounts) => ({ accounts, timestamp: Date.now() }),
  });

  const [optimisticList, setOptimisticList] = useState(list);
  const accounts = list.timestamp > optimisticList.timestamp ? list.accounts : optimisticList.accounts;

  const setOptimisticAccounts = useCallback((accounts: typeof list.accounts) => {
    setOptimisticList({ accounts, timestamp: Date.now() });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const from = accounts.findIndex((a) => a.id === active.id);
      const to = accounts.findIndex((a) => a.id === over.id);
      if (from === -1 || to === -1) return;

      const ordered = arrayMove(accounts, from, to);
      const movedId = String(active.id);

      // Slot the moved row between its new neighbours when there is room, so a
      // single drag writes a single row instead of renumbering the whole list.
      const prevOrder = to > 0 ? ordered[to - 1].order : undefined;
      const nextOrder = to < ordered.length - 1 ? ordered[to + 1].order : undefined;
      let movedOrder: number | null = null;
      if (typeof prevOrder === "number" && typeof nextOrder === "number") {
        const mid = (prevOrder + nextOrder) / 2;
        if (mid > prevOrder && mid < nextOrder) movedOrder = mid;
      } else if (typeof prevOrder === "number" && nextOrder === undefined) {
        movedOrder = prevOrder + 1;
      } else if (typeof nextOrder === "number" && prevOrder === undefined) {
        movedOrder = nextOrder - 1;
      }

      if (movedOrder !== null) {
        const order = movedOrder;
        setOptimisticAccounts(ordered.map((a) => (a.id === movedId ? { ...a, order } : a)));
        db.db.executeKysely((q) => q.updateTable("account").set({ order }).where("id", "=", movedId));
        return;
      }

      setOptimisticAccounts(ordered.map((a, i) => ({ ...a, order: i + 1 })));
      db.db.executeTransaction((trx) => {
        ordered.forEach((a, i) => {
          trx.executeKysely((q) =>
            q
              .updateTable("account")
              .set({ order: i + 1 })
              .where("id", "=", a.id),
          );
        });
      });
    },
    [accounts, db, setOptimisticAccounts],
  );

  return { accounts, handleDragEnd };
}
