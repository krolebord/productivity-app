import type { DragEndEvent } from "@dnd-kit/core";
import { useReorderableAccounts as useCoreReorderableAccounts } from "@productivity/core/data/accounts";
import { useCallback } from "react";

/** Accounts plus a dnd-kit drag handler that inserts the dragged account at its drop index. */
export function useReorderableAccounts() {
  const { accounts, moveAccount } = useCoreReorderableAccounts();

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      moveAccount(
        accounts.findIndex((a) => a.id === active.id),
        accounts.findIndex((a) => a.id === over.id),
      );
    },
    [accounts, moveAccount],
  );

  return { accounts, handleDragEnd };
}
