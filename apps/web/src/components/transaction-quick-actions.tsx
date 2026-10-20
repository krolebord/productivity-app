import { useCreateExpense, useCreateIncome, useCreateTransfer } from "@/components/transaction-dialog";
import { Button } from "@/components/ui/button";
import { TRANSACTION_TYPE_STYLE } from "@/lib/finance-ui";
import { cn } from "@/lib/utils";

/**
 * The one Expense / Income / Transfer trio. Mounted in the finances header so
 * every finance tab (including on mobile, where the buttons used to be hidden)
 * has the same entry point. `accountId` preselects the account in the dialog.
 */
export function TransactionQuickActions({ accountId, className }: { accountId?: string; className?: string }) {
  const defaults = accountId ? { accountId } : undefined;
  const createExpense = useCreateExpense(defaults);
  const createIncome = useCreateIncome(defaults);
  const createTransfer = useCreateTransfer(defaults);

  const actions = [
    { type: "expense", variant: "default", onClick: createExpense },
    { type: "income", variant: "outline", onClick: createIncome },
    { type: "transfer", variant: "outline", onClick: createTransfer },
  ] as const;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {actions.map(({ type, variant, onClick }) => {
        const style = TRANSACTION_TYPE_STYLE[type];
        const Icon = style.icon;

        return (
          <Button
            key={type}
            type="button"
            size="sm"
            variant={variant}
            onClick={onClick}
            aria-label={`New ${style.label.toLowerCase()}`}
            className="flex-1 sm:flex-none"
          >
            <Icon className="size-4" />
            {style.label}
          </Button>
        );
      })}
    </div>
  );
}
