import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { formatForDisplay } from "@tanstack/hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, RefreshCwIcon, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { AccountCard } from "@/components/account-card";
import { useCreateAccount, useRefreshAccountBalances } from "@/components/account-dialog";
import { Button } from "@/components/ui/button";
import { NEW_ACCOUNT_HOTKEY } from "@/lib/hotkeys";
import { useDb, useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const db = useDb();
  const createAccount = useCreateAccount();
  const refreshBalances = useRefreshAccountBalances();

  const { data: list } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"), {
    mapData: (accounts) => ({ accounts, timestamp: Date.now() }),
  });

  const [optimisticList, _setOptimisticList] = useState<typeof list>(list);
  const setOptimisticAccounts = useCallback((accounts: (typeof list)["accounts"]) => {
    _setOptimisticList({ accounts, timestamp: Date.now() });
  }, []);
  const accounts = list.timestamp > optimisticList.timestamp ? list.accounts : optimisticList.accounts;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = accounts.findIndex((a) => a.id === active.id);
    const to = accounts.findIndex((a) => a.id === over.id);
    if (from === -1 || to === -1) return;

    const ordered = arrayMove(accounts, from, to);
    const movedId = String(active.id);
    const movedIndex = to;

    const prevOrder = movedIndex > 0 ? ordered[movedIndex - 1].order : undefined;
    const nextOrder = movedIndex < ordered.length - 1 ? ordered[movedIndex + 1].order : undefined;
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
    } else {
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
    }
  }

  return (
    <div className="@container px-4 py-4 sm:px-6 sm:py-6">
      <div className="@xl:mb-6 mb-4 flex @xl:flex-row flex-col @xl:items-center @xl:justify-between gap-3">
        <h1 className="font-semibold text-xl">Accounts</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={refreshBalances} size="sm" variant="outline" disabled={accounts.length === 0}>
            <RefreshCwIcon />
            Refresh balances
          </Button>
          <Button onClick={createAccount} size="sm">
            <PlusIcon />
            New account
            <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
              {formatForDisplay(NEW_ACCOUNT_HOTKEY)}
            </kbd>
          </Button>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <Wallet className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No accounts yet</p>
            <p className="text-muted-foreground text-sm">Create one to start tracking your finances.</p>
          </div>
          <Button onClick={createAccount} variant="outline">
            <PlusIcon />
            New account
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={accounts.map((a) => a.id)} strategy={rectSortingStrategy}>
          <div className="grid @4xl:grid-cols-3 @md:grid-cols-2 grid-cols-1 gap-4">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
