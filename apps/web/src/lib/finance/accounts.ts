import type { DragEndEvent } from "@dnd-kit/core";
import { reorderAccounts, saveAccountOrder, useTimestampedAccounts } from "@productivity/core/data/accounts";
import { useDb } from "@productivity/core/user-db/db-context";
import { useCallback, useState } from "react";

/**
 * Accounts plus a drag handler that inserts the dragged account at its drop
 * index. Reordering paints from local state until the query catches up,
 * otherwise the row snaps back to its old slot for a frame.
 */
export function useReorderableAccounts() {
  const db = useDb();

  const list = useTimestampedAccounts();

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

      const { ordered, changes } = reorderAccounts(accounts, from, to);
      setOptimisticAccounts(ordered);
      saveAccountOrder(db.db, changes);
    },
    [accounts, db, setOptimisticAccounts],
  );

  return { accounts, handleDragEnd };
}
