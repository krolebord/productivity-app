import {
  createAccount,
  deleteAccount as deleteAccountRow,
  updateAccount,
  useAccount,
  useAccountHasTransactions,
} from "@productivity/core/data/accounts";
import {
  createDynamicValidationLogic,
  dynamicZodValidators,
  finiteAmountString,
} from "@productivity/core/form-schemas";
import { refreshAccountBalances } from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useStore } from "@tanstack/react-form";
import { Trash2Icon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog";
import { useAppForm } from "./ui/form";

const accountFormSchema = z.object({
  labelText: z.string(),
  labelColor: z.string(),
  currency: z.string().min(1, "Currency is required."),
  balance: finiteAmountString("Balance"),
  description: z.string(),
});

const LABEL_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#09090b",
];

export const useAccountDialogStore = create(
  combine(
    {
      isOpen: false as boolean,
      mode: null as "create" | "edit" | null,
      accountId: null as string | null,
      openRevision: 0,
    },
    (set, get) => ({
      openCreate: () => set({ isOpen: true, mode: "create", accountId: null, openRevision: get().openRevision + 1 }),
      openEdit: (id: string) =>
        set({ isOpen: true, mode: "edit", accountId: id, openRevision: get().openRevision + 1 }),
      close: () => set({ isOpen: false, mode: null, accountId: null }),
    }),
  ),
);

export function useCreateAccount() {
  const openCreate = useAccountDialogStore((s) => s.openCreate);
  return useCallback(() => openCreate(), [openCreate]);
}

export function useRefreshAccountBalances() {
  const db = useDb();
  return useCallback(() => {
    try {
      const result = refreshAccountBalances(db.db);
      toast.success(`Refreshed ${result.accountCount} account${result.accountCount === 1 ? "" : "s"}.`, {
        description:
          result.changedCount === 0
            ? "All balances were already correct."
            : `Updated ${result.changedCount} balance${result.changedCount === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      toast.error("Could not refresh balances.", {
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }, [db]);
}

function AccountDialogContent() {
  const { mode, accountId } = useAccountDialogStore();
  const closeDialog = useAccountDialogStore((x) => x.close);
  const db = useDb();

  const account = useAccount(accountId);
  const existing = mode === "edit" ? account : undefined;
  const hasTransactionHistory = useAccountHasTransactions(accountId);

  function persistAccount(value: {
    balance: number;
    currency: string;
    description: string;
    labelColor: string;
    labelText: string;
  }) {
    if (mode === "create") {
      createAccount(db.db, value);

      closeDialog();
      return;
    }

    if (mode !== "edit" || !accountId || !existing) {
      return;
    }

    updateAccount(db.db, existing, value);

    closeDialog();
  }

  /**
   * Deleting is only offered once the account has no entries pointing at it:
   * removing it while transactions reference it would leave them orphaned.
   */
  function deleteAccount() {
    if (mode !== "edit" || !accountId) return;

    if (hasTransactionHistory) {
      toast.error("Delete or move related transactions before removing this account.");
      return;
    }

    deleteAccountRow(db.db, accountId);
    closeDialog();
  }

  const form = useAppForm({
    validationLogic: createDynamicValidationLogic(),
    validators: dynamicZodValidators(accountFormSchema),
    defaultValues: {
      labelText: existing?.labelText ?? "",
      labelColor: existing?.labelColor ?? "#8b5cf6",
      currency: existing?.currency ?? "USD",
      balance: String(mode === "edit" ? (existing?.balance ?? 0) : 0),
      description: existing?.description ?? "",
    },
    onSubmit: ({ value }) => {
      persistAccount({
        balance: Number.parseFloat(value.balance),
        currency: value.currency,
        description: value.description,
        labelColor: value.labelColor,
        labelText: value.labelText,
      });
    },
  });
  const selectedCurrency = useStore(form.store, (state) => state.values.currency);

  return (
    <>
      <DialogTitle>{mode === "create" ? "New account" : "Edit account"}</DialogTitle>
      <DialogDescription className="sr-only">Create or edit an account and its current balance.</DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <form.AppField name="labelText">
          {(field) => (
            <field.FormInput
              placeholder="Account name"
              className="rounded-none border-0 border-b bg-transparent! px-0 font-semibold text-base shadow-none focus-visible:border-primary focus-visible:ring-0"
            />
          )}
        </form.AppField>

        <form.AppField name="labelColor">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Color</span>
              <div className="flex gap-2">
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="size-6 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        field.state.value === color ? `0 0 0 2px var(--background), 0 0 0 4px ${color}` : undefined,
                    }}
                    onClick={() => field.handleChange(color)}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>
          )}
        </form.AppField>

        <div className="flex gap-3">
          <form.AppField name="currency">
            {(field) => (
              <field.FieldContainer labelText="Currency" className="flex-1">
                <CurrencySelect
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value)}
                  onBlur={() => field.handleBlur()}
                />
              </field.FieldContainer>
            )}
          </form.AppField>

          <form.AppField name="balance">
            {(field) => (
              <field.FieldContainer labelText={mode === "create" ? "Initial balance" : "Balance"} className="flex-1">
                <field.FormInput
                  type="number"
                  step="0.01"
                  className="font-mono tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </field.FieldContainer>
            )}
          </form.AppField>
        </div>

        {mode === "edit" && hasTransactionHistory && existing?.currency !== selectedCurrency && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Changing the account currency only affects future transactions. Existing transaction amounts keep their
            original currency.
          </p>
        )}

        <form.AppField name="description">
          {(field) => (
            <field.FieldContainer labelText="Description">
              <field.FormTextarea placeholder="Optional description..." className="min-h-20 resize-none" />
            </field.FieldContainer>
          )}
        </form.AppField>

        <DialogFooter>
          {mode === "edit" && (
            <Button
              type="button"
              variant="ghost"
              onClick={deleteAccount}
              disabled={hasTransactionHistory}
              title={hasTransactionHistory ? "This account still has transactions." : undefined}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
            >
              <Trash2Icon className="size-4" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button type="submit">{mode === "create" ? "Create" : "Save"}</Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function AccountDialog() {
  const isOpen = useAccountDialogStore((x) => x.isOpen);
  const openRevision = useAccountDialogStore((x) => x.openRevision);
  const closeDialog = useAccountDialogStore((x) => x.close);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <AccountDialogContent key={openRevision} />
      </DialogContent>
    </Dialog>
  );
}
