import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AmountConverter } from "@productivity/core/finance/overview";
import type { AccountItem } from "@productivity/core/user-db/migrations";
import { GripVerticalIcon, PlusIcon, WalletIcon } from "lucide-react";
import { useCreateAccount } from "@/components/account-dialog";
import { AccountBalanceRow } from "@/components/account-row";
import { SectionCard } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useReorderableAccounts } from "@/lib/finance/accounts";
import { cn } from "@/lib/utils";

function SortableAccountRow({
  account,
  baseCurrency,
  convert,
}: {
  account: AccountItem;
  baseCurrency: string;
  convert: AmountConverter;
}) {
  const sortable = useSortable({ id: account.id });
  const converted = account.currency === baseCurrency ? null : convert(Number(account.balance), account.currency);

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      className={cn("bg-card", sortable.isDragging && "relative z-10 opacity-50")}
    >
      <AccountBalanceRow
        account={account}
        convertedBalance={converted === null ? null : { amount: converted, currency: baseCurrency }}
        leading={
          <button
            type="button"
            aria-label={`Reorder ${account.labelText || "untitled account"}`}
            className="shrink-0 cursor-grab touch-none py-2.5 pr-1 pl-3 text-muted-foreground/40 transition-colors hover:text-foreground"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>
        }
      />
    </div>
  );
}

/**
 * The accounts list itself, not a preview of one: rows reorder by drag, the eye
 * toggles whether an account counts toward the dashboard, and a row opens that
 * account's ledger. Creating and refreshing live in the finances header menu,
 * since they apply from every tab.
 */
export function AccountsOverviewCard({ baseCurrency, convert }: { baseCurrency: string; convert: AmountConverter }) {
  const { accounts, handleDragEnd } = useReorderableAccounts();
  const createAccount = useCreateAccount();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const hiddenCount = accounts.filter((account) => account.excludeFromDashboard).length;

  return (
    <SectionCard
      title="Accounts"
      actions={
        hiddenCount > 0 ? <span className="text-muted-foreground text-xs">{hiddenCount} hidden from totals</span> : null
      }
    >
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <WalletIcon className="size-7 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">No accounts yet</p>
            <p className="text-muted-foreground text-sm">Create one to start tracking your finances.</p>
          </div>
          <Button onClick={createAccount} size="sm" variant="outline">
            <PlusIcon />
            New account
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={accounts.map((account) => account.id)} strategy={verticalListSortingStrategy}>
            <div className="divide-y">
              {accounts.map((account) => (
                <SortableAccountRow key={account.id} account={account} baseCurrency={baseCurrency} convert={convert} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </SectionCard>
  );
}
