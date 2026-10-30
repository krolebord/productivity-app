import { useAccounts } from "@productivity/core/data/accounts";
import {
  useCategoryImportanceCounts,
  useRecentTransactionCategories,
  useTransaction,
} from "@productivity/core/data/transactions";
import { formatDateTimeLocal, parseDateTimeLocal } from "@productivity/core/date-time";
import { inferCategoryImportance } from "@productivity/core/finance/category-importance";
import { formatTransferRate } from "@productivity/core/finance/transfer-rate";
import { createDynamicValidationLogic, dynamicZodValidators } from "@productivity/core/form-schemas";
import {
  createTransaction,
  deleteTransaction,
  type ImportanceTier,
  TRANSACTION_TYPES,
  type TransactionType,
  updateTransaction,
} from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useStore } from "@tanstack/react-form";
import { ArrowBigUpIcon, ArrowLeftRightIcon, CornerDownLeftIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { TRANSACTION_TYPE_STYLE } from "@/lib/finance-ui";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useCreateAccount } from "./account-dialog";
import { createTransactionFormSchema } from "./transaction-dialog.schema";
import { AccountPicker, CategoryPicker, Chip, DatePicker, ImportancePicker } from "./transaction-dialog-pickers";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerVirtualKeyboardProvider } from "./ui/drawer";
import { getErrorMessage, useAppForm } from "./ui/form";
import { useInlineConfirm } from "./ui/inline-confirm";
import { Textarea } from "./ui/textarea";

type TransactionDialogDraft = {
  accountId?: string;
  counterpartyAccountId?: string;
  type?: TransactionType;
};

type TransactionDialogState = {
  draft: TransactionDialogDraft | null;
  isOpen: boolean;
  mode: "create" | "edit" | null;
  openRevision: number;
  transactionId: string | null;
};

const defaultDraft: TransactionDialogDraft = {
  type: "expense",
};

export const useTransactionDialogStore = create(
  combine(
    {
      isOpen: false,
      mode: null,
      transactionId: null,
      draft: null,
      openRevision: 0,
    } as TransactionDialogState,
    (set, get) => ({
      close: () => set({ isOpen: false, mode: null, draft: null }),
      openCreate: (draft?: TransactionDialogDraft) =>
        set({
          isOpen: true,
          mode: "create",
          transactionId: null,
          draft: { ...defaultDraft, ...draft },
          openRevision: get().openRevision + 1,
        }),
      openEdit: (transactionId: string) =>
        set({
          isOpen: true,
          mode: "edit",
          transactionId,
          draft: null,
          openRevision: get().openRevision + 1,
        }),
    }),
  ),
);

function useOpenTransaction(defaults?: TransactionDialogDraft) {
  const openCreate = useTransactionDialogStore((state) => state.openCreate);
  return useCallback(() => openCreate(defaults), [defaults, openCreate]);
}

export function useCreateExpense(defaults?: Omit<TransactionDialogDraft, "type">) {
  return useOpenTransaction({ ...defaults, type: "expense" });
}

export function useCreateIncome(defaults?: Omit<TransactionDialogDraft, "type">) {
  return useOpenTransaction({ ...defaults, type: "income" });
}

export function useCreateTransfer(defaults?: Omit<TransactionDialogDraft, "type">) {
  return useOpenTransaction({ ...defaults, type: "transfer" });
}

const DEFAULT_IMPORTANCE: ImportanceTier = "flexible";

const DIALOG_PARTS = { Title: DialogTitle, Description: DialogDescription };
const DRAWER_PARTS = { Title: DrawerTitle, Description: DrawerDescription };

function getDialogTitle(mode: "create" | "edit" | null, type: TransactionType | undefined) {
  if (mode === "edit") {
    return type === "adjustment" ? "Edit adjustment" : "Edit transaction";
  }

  switch (type) {
    case "income":
      return "New income";
    case "transfer":
      return "New transfer";
    case "adjustment":
      return "New adjustment";
    default:
      return "New expense";
  }
}

const TITLE_PLACEHOLDER: Record<TransactionType, string> = {
  expense: "What was it?",
  income: "Where from?",
  transfer: "Between accounts",
  adjustment: "Manual correction",
};

const SUBMIT_CLASS: Record<TransactionType, string | undefined> = {
  expense: undefined,
  income: "bg-emerald-600 text-white hover:bg-emerald-600/90 active:bg-emerald-600/80",
  transfer: "bg-blue-600 text-white hover:bg-blue-600/90 active:bg-blue-600/80",
  adjustment: "bg-amber-500 text-amber-950 hover:bg-amber-500/90 active:bg-amber-500/80",
};

const VALIDATED_FIELDS = [
  "type",
  "accountId",
  "counterpartyAccountId",
  "amount",
  "counterpartyAmount",
  "effectiveAt",
] as const;

function sanitizeAmount(raw: string) {
  const [whole = "", ...fraction] = raw
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "")
    .split(".");
  return fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
}

function isNonZeroAmount(amount: string) {
  const value = Number.parseFloat(amount);
  return Number.isFinite(value) && value !== 0;
}

function AmountInput({
  value,
  onChange,
  onBlur,
  sign,
  suffix,
  inputRef,
  invalid,
  label,
  className,
}: {
  value: string;
  onChange: (value: string, typedSign: "+" | "-" | null) => void;
  onBlur?: () => void;
  sign?: ReactNode;
  suffix?: ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
  invalid?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-full items-baseline justify-center font-mono font-semibold tabular-nums tracking-tight",
        className,
      )}
    >
      {sign}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder="0"
        value={value}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          onChange(sanitizeAmount(raw), raw.includes("-") ? "-" : raw.includes("+") ? "+" : null);
        }}
        onBlur={onBlur}
        style={{ width: `${Math.max(value.length, 1) + 0.25}ch` }}
        className={cn(
          "min-w-0 max-w-full bg-transparent outline-none placeholder:text-muted-foreground/40",
          invalid && "underline decoration-2 decoration-destructive underline-offset-8",
        )}
      />
      {suffix && <span className="ml-1 font-normal font-sans text-muted-foreground text-sm">{suffix}</span>}
    </div>
  );
}

function SwapButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={onClick}
      aria-label="Swap accounts"
      title="Swap accounts"
      className="shrink-0 bg-muted text-blue-600 md:size-8 dark:text-blue-400"
    >
      <ArrowLeftRightIcon />
    </Button>
  );
}

function TransactionDialogContent({ amountInputRef }: { amountInputRef: RefObject<HTMLInputElement | null> }) {
  const db = useDb();
  const createAccount = useCreateAccount();
  const { draft, mode, transactionId } = useTransactionDialogStore();
  const { Title, Description } = useIsDesktop() ? DIALOG_PARTS : DRAWER_PARTS;
  const closeDialog = useTransactionDialogStore((state) => state.close);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const addMoreRef = useRef(false);
  const importanceTouchedRef = useRef(mode === "edit");

  const deleteConfirm = useInlineConfirm({
    onConfirm: () => {
      if (!transactionId) return;
      deleteTransaction(db.db, transactionId);
      closeDialog();
    },
  });

  const accounts = useAccounts();
  const existingTransaction = useTransaction(transactionId);
  const categories = useRecentTransactionCategories();

  const importanceRows = useCategoryImportanceCounts();
  const importanceByCategory = useMemo(() => inferCategoryImportance(importanceRows), [importanceRows]);

  const existing = mode === "edit" ? existingTransaction : undefined;
  const selectedType = (existing?.type ?? draft?.type ?? "expense") as TransactionType;
  const fallbackAccountId = accounts[0]?.id ?? "";
  const fallbackTransferAccountId =
    accounts.find((account) => account.id !== (draft?.accountId ?? fallbackAccountId))?.id ?? "";
  const [showNotes, setShowNotes] = useState(Boolean(existing?.notes));

  const form = useAppForm({
    validationLogic: createDynamicValidationLogic(),
    validators: dynamicZodValidators(createTransactionFormSchema(accounts.length)),
    defaultValues: {
      accountId: existing?.accountId ?? draft?.accountId ?? fallbackAccountId,
      amount: existing
        ? existing.type === "adjustment"
          ? String(existing.amount)
          : String(Math.abs(Number(existing.amount)))
        : "",
      category: existing?.category ?? "",
      importance: existing?.importance ?? "",
      counterpartyAccountId:
        existing?.counterpartyAccountId ?? draft?.counterpartyAccountId ?? fallbackTransferAccountId,
      counterpartyAmount: existing ? String(Math.abs(Number(existing.counterpartyAmount ?? 0))) : "",
      effectiveAt: formatDateTimeLocal(existing?.effectiveAt ?? Date.now()),
      notes: existing?.notes ?? "",
      title: existing?.title ?? "",
      type: selectedType,
    },
    onSubmit: ({ value }) => {
      const addMore = addMoreRef.current;
      addMoreRef.current = false;
      const effectiveAt = parseDateTimeLocal(value.effectiveAt);
      const baseInput = {
        accountId: value.accountId,
        effectiveAt,
        notes: value.notes,
        title: value.title,
      };

      switch (value.type as TransactionType) {
        case "expense":
          createOrUpdate({
            ...baseInput,
            amount: Number.parseFloat(value.amount),
            category: value.category,
            importance: value.importance ? (value.importance as ImportanceTier) : null,
            type: "expense",
          });
          break;
        case "income":
          createOrUpdate({
            ...baseInput,
            amount: Number.parseFloat(value.amount),
            category: value.category,
            type: "income",
          });
          break;
        case "transfer":
          createOrUpdate({
            ...baseInput,
            amount: Number.parseFloat(value.amount),
            counterpartyAccountId: value.counterpartyAccountId,
            counterpartyAmount: Number.parseFloat(value.counterpartyAmount),
            type: "transfer",
          });
          break;
        case "adjustment":
          createOrUpdate({
            ...baseInput,
            amount: Number.parseFloat(value.amount),
            category: value.category,
            type: "adjustment",
          });
          break;
      }

      if (mode === "create" && addMore) {
        for (const field of ["amount", "counterpartyAmount", "notes", "title"] as const) {
          form.setFieldValue(field, "", { dontValidate: true });
        }
        setShowNotes(false);
        queueMicrotask(() => amountInputRef.current?.focus());
        return;
      }

      closeDialog();
    },
  });

  function createOrUpdate(input: Parameters<typeof createTransaction>[1] | Parameters<typeof updateTransaction>[2]) {
    if (mode === "edit" && transactionId) {
      updateTransaction(db.db, transactionId, input);
      return;
    }

    createTransaction(db.db, input);
  }

  const values = useStore(form.store, (state) => state.values);
  const submissionAttempts = useStore(form.store, (state) => state.submissionAttempts);
  const fieldMeta = useStore(form.store, (state) => state.fieldMeta);
  const currentType = values.type as TransactionType;

  useEffect(() => {
    if (currentType !== "expense" || importanceTouchedRef.current) return;
    const suggested = importanceByCategory.get(values.category.trim()) ?? DEFAULT_IMPORTANCE;
    if (form.getFieldValue("importance") !== suggested) {
      form.setFieldValue("importance", suggested);
    }
  }, [currentType, values.category, importanceByCategory, form]);

  const sourceAccount = accounts.find((account) => account.id === values.accountId);
  const destinationAccount = accounts.find((account) => account.id === values.counterpartyAccountId);
  const canRenderTransfer = currentType === "transfer" && accounts.length >= 2;
  const hasCounterpartyAmount =
    canRenderTransfer &&
    !(sourceAccount && destinationAccount && sourceAccount.currency === destinationAccount.currency);
  const rate =
    hasCounterpartyAmount && sourceAccount && destinationAccount
      ? formatTransferRate(
          Number.parseFloat(values.amount),
          Number.parseFloat(values.counterpartyAmount),
          sourceAccount.currency,
          destinationAccount.currency,
        )
      : null;

  const defaultValues = form.options.defaultValues;
  const isUnchanged =
    mode === "edit" &&
    defaultValues !== undefined &&
    (Object.keys(values) as (keyof typeof values)[]).every((key) => values[key] === defaultValues[key]);
  const canSubmit =
    Boolean(sourceAccount) &&
    isNonZeroAmount(values.amount) &&
    (currentType !== "transfer" || (canRenderTransfer && Boolean(destinationAccount))) &&
    (!hasCounterpartyAmount || isNonZeroAmount(values.counterpartyAmount)) &&
    !isUnchanged;

  const visibleErrors = new Map<string, string>();
  for (const field of VALIDATED_FIELDS) {
    if (field === "counterpartyAmount" && !hasCounterpartyAmount) continue;
    const meta = fieldMeta[field];
    if (meta && meta.errors.length > 0 && (meta.isTouched || submissionAttempts > 0)) {
      visibleErrors.set(field, getErrorMessage(meta.errors[0]));
    }
  }
  const errorMessages = [...new Set(visibleErrors.values())];

  function mirrorTransferAmount() {
    if (form.getFieldValue("type") !== "transfer") return;
    const source = accounts.find((account) => account.id === form.getFieldValue("accountId"));
    const destination = accounts.find((account) => account.id === form.getFieldValue("counterpartyAccountId"));
    if (source && destination && source.currency === destination.currency) {
      form.setFieldValue("counterpartyAmount", form.getFieldValue("amount"));
    }
  }

  function changeType(type: TransactionType) {
    form.setFieldValue("type", type);
    const amount = form.getFieldValue("amount");
    if (type !== "adjustment" && amount.startsWith("-")) {
      form.setFieldValue("amount", amount.slice(1));
    }
    mirrorTransferAmount();
  }

  function swapTransferSides() {
    const accountId = form.getFieldValue("accountId");
    const amount = form.getFieldValue("amount");
    form.setFieldValue("accountId", form.getFieldValue("counterpartyAccountId"));
    form.setFieldValue("counterpartyAccountId", accountId);
    form.setFieldValue("amount", form.getFieldValue("counterpartyAmount"));
    form.setFieldValue("counterpartyAmount", amount);
  }

  function revealNotes() {
    setShowNotes(true);
    queueMicrotask(() => notesRef.current?.focus());
  }

  function submit(addMore: boolean) {
    if (!canSubmit) return;
    addMoreRef.current = addMore;
    form.handleSubmit();
  }

  function openAccountCreator() {
    closeDialog();
    createAccount();
  }

  const typeStyle = TRANSACTION_TYPE_STYLE[currentType];
  const isNegativeAdjustment = currentType === "adjustment" && values.amount.startsWith("-");

  if (accounts.length === 0) {
    return (
      <>
        <Title>{getDialogTitle(mode, currentType)}</Title>
        <Description className="sr-only">Create or edit a balance-affecting transaction.</Description>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-muted-foreground text-sm">
            Create an account before adding income, expenses, or transfers.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="button" onClick={openAccountCreator}>
              New account
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <form
      className="flex min-w-0 flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          submit(false);
        } else if (event.shiftKey && mode === "create" && !(event.target instanceof HTMLTextAreaElement)) {
          event.preventDefault();
          submit(true);
        }
      }}
    >
      <Title className="sr-only">{getDialogTitle(mode, currentType)}</Title>
      <Description className="sr-only">Create or edit a balance-affecting transaction.</Description>

      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Transaction type" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {TRANSACTION_TYPES.map((type) => {
            const style = TRANSACTION_TYPE_STYLE[type];
            const Icon = style.icon;
            const isActive = currentType === type;
            const iconOnly = type === "adjustment";
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={style.label}
                title={iconOnly ? style.label : undefined}
                onClick={() => changeType(type)}
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-md font-medium text-xs transition-colors md:h-9 md:px-3.5 md:text-sm",
                  iconOnly ? "px-2" : "px-2.5",
                  isActive ? style.activeClass : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span className={cn(iconOnly && "hidden md:inline")}>{style.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-3">
        {hasCounterpartyAmount ? (
          <>
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
              <div className="flex min-w-0 flex-col items-center gap-2">
                <form.Field name="amount">
                  {(field) => (
                    <AmountInput
                      inputRef={amountInputRef}
                      label={`Sent amount${sourceAccount ? ` (${sourceAccount.currency})` : ""}`}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      invalid={visibleErrors.has("amount")}
                      suffix={sourceAccount?.currency}
                      className="text-3xl"
                    />
                  )}
                </form.Field>
                <form.Field name="accountId">
                  {(field) => (
                    <AccountPicker
                      title="From account"
                      accounts={accounts}
                      value={field.state.value}
                      onChange={(accountId) => {
                        field.handleChange(accountId);
                        mirrorTransferAmount();
                      }}
                      invalid={visibleErrors.has("accountId")}
                      showCurrency={false}
                    />
                  )}
                </form.Field>
              </div>
              <div className="pt-1">
                <SwapButton onClick={swapTransferSides} />
              </div>
              <div className="flex min-w-0 flex-col items-center gap-2">
                <form.Field name="counterpartyAmount">
                  {(field) => (
                    <AmountInput
                      label={`Received amount${destinationAccount ? ` (${destinationAccount.currency})` : ""}`}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      invalid={visibleErrors.has("counterpartyAmount")}
                      suffix={destinationAccount?.currency}
                      className="text-3xl"
                    />
                  )}
                </form.Field>
                <form.Field name="counterpartyAccountId">
                  {(field) => (
                    <AccountPicker
                      title="To account"
                      accounts={accounts}
                      value={field.state.value}
                      onChange={(accountId) => {
                        field.handleChange(accountId);
                        mirrorTransferAmount();
                      }}
                      invalid={visibleErrors.has("counterpartyAccountId")}
                      showCurrency={false}
                    />
                  )}
                </form.Field>
              </div>
            </div>
            {rate && <p className="font-mono text-muted-foreground text-xs">{rate}</p>}
          </>
        ) : (
          <>
            <form.Field name="amount">
              {(field) => (
                <AmountInput
                  inputRef={amountInputRef}
                  label={`${currentType === "adjustment" ? "Balance change" : "Amount"}${sourceAccount ? ` (${sourceAccount.currency})` : ""}`}
                  value={field.state.value.replace(/^-/, "")}
                  onChange={(amount, typedSign) => {
                    const negative = typedSign ? typedSign === "-" : isNegativeAdjustment;
                    const signed = currentType === "adjustment" && negative ? `-${amount}` : amount;
                    field.handleChange(signed);
                    if (canRenderTransfer) form.setFieldValue("counterpartyAmount", signed);
                    if (typedSign && (currentType === "expense" || currentType === "income")) {
                      changeType(typedSign === "+" ? "income" : "expense");
                    }
                  }}
                  onBlur={field.handleBlur}
                  invalid={visibleErrors.has("amount")}
                  className={cn("text-5xl", typeStyle.accent)}
                  sign={
                    currentType === "adjustment" ? (
                      <button
                        type="button"
                        aria-label={isNegativeAdjustment ? "Make positive" : "Make negative"}
                        onClick={() =>
                          field.handleChange(
                            isNegativeAdjustment ? field.state.value.slice(1) : `-${field.state.value}`,
                          )
                        }
                        className="rounded-md px-1 hover:bg-muted"
                      >
                        {isNegativeAdjustment ? "−" : "+"}
                      </button>
                    ) : (
                      <span aria-hidden>{currentType === "expense" ? "−" : currentType === "income" ? "+" : ""}</span>
                    )
                  }
                />
              )}
            </form.Field>
            <div className="flex max-w-full items-center gap-1.5">
              <form.Field name="accountId">
                {(field) => (
                  <AccountPicker
                    title={canRenderTransfer ? "From account" : "Account"}
                    accounts={accounts}
                    value={field.state.value}
                    onChange={(accountId) => {
                      field.handleChange(accountId);
                      mirrorTransferAmount();
                    }}
                    invalid={visibleErrors.has("accountId")}
                  />
                )}
              </form.Field>
              {canRenderTransfer && (
                <>
                  <SwapButton onClick={swapTransferSides} />
                  <form.Field name="counterpartyAccountId">
                    {(field) => (
                      <AccountPicker
                        title="To account"
                        accounts={accounts}
                        value={field.state.value}
                        onChange={(accountId) => {
                          field.handleChange(accountId);
                          mirrorTransferAmount();
                        }}
                        invalid={visibleErrors.has("counterpartyAccountId")}
                      />
                    )}
                  </form.Field>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {currentType === "transfer" && accounts.length < 2 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Transfers require at least two accounts.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <form.Field name="title">
          {(field) => (
            <input
              aria-label="Title"
              autoComplete="off"
              placeholder={TITLE_PLACEHOLDER[currentType]}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
              onBlur={field.handleBlur}
              className="w-full rounded-md bg-transparent px-2 py-1 text-center font-medium text-lg outline-none placeholder:font-normal placeholder:text-muted-foreground/60 placeholder-shown:bg-muted/40 focus-visible:bg-muted"
            />
          )}
        </form.Field>

        <div className="flex flex-wrap justify-center gap-2">
          {currentType !== "transfer" && (
            <form.Field name="category">
              {(field) => (
                <CategoryPicker categories={categories} value={field.state.value} onChange={field.handleChange} />
              )}
            </form.Field>
          )}
          {currentType === "expense" && (
            <form.Field name="importance">
              {(field) => (
                <ImportancePicker
                  value={field.state.value ? (field.state.value as ImportanceTier) : null}
                  onChange={(tier) => {
                    importanceTouchedRef.current = true;
                    field.handleChange(tier);
                  }}
                />
              )}
            </form.Field>
          )}
          <form.Field name="effectiveAt">
            {(field) => (
              <DatePicker
                value={field.state.value}
                onChange={field.handleChange}
                invalid={visibleErrors.has("effectiveAt")}
              />
            )}
          </form.Field>
          {!showNotes && (
            <Chip empty onClick={revealNotes}>
              <PlusIcon className="size-3.5" />
              Note
            </Chip>
          )}
        </div>

        {showNotes && (
          <form.Field name="notes">
            {(field) => (
              <Textarea
                ref={notesRef}
                aria-label="Note"
                placeholder="Note"
                rows={2}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
                onBlur={field.handleBlur}
                className="min-h-16 resize-none"
              />
            )}
          </form.Field>
        )}
      </div>

      {errorMessages.length > 0 && (
        <div role="alert" className="-mt-1 text-center text-destructive text-sm">
          {errorMessages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <div className="flex gap-2 md:justify-end">
        {mode === "edit" && transactionId && (
          <Button
            type="button"
            variant={deleteConfirm.armed ? "destructive" : "outline"}
            aria-label={deleteConfirm.armed ? undefined : "Delete transaction"}
            className={cn(
              "h-11 md:mr-auto md:h-9",
              !deleteConfirm.armed && "w-11 text-destructive hover:bg-destructive/10 hover:text-destructive md:w-auto",
            )}
            {...deleteConfirm.getButtonProps()}
          >
            <Trash2Icon />
            {deleteConfirm.armed ? (
              <>
                <span className="md:hidden">Delete?</span>
                <span className="hidden md:inline">Click again to delete</span>
              </>
            ) : (
              <span className="hidden md:inline">Delete</span>
            )}
          </Button>
        )}
        {mode === "create" && (
          <Button
            type="button"
            variant="outline"
            disabled={!canSubmit}
            onClick={() => submit(true)}
            className="h-11 md:h-9"
          >
            <span className="md:hidden">Create &amp; new</span>
            <span className="hidden md:inline">Create &amp; add another</span>
            <Kbd className="hidden text-muted-foreground md:inline-flex">
              <ArrowBigUpIcon className="size-3" />
              <CornerDownLeftIcon className="size-3" />
            </Kbd>
          </Button>
        )}
        <Button
          type="submit"
          disabled={!canSubmit}
          className={cn("h-11 flex-1 md:h-9 md:flex-none", SUBMIT_CLASS[currentType])}
        >
          {mode === "edit" ? "Save" : "Create"}
          <Kbd className="hidden border-current/30 opacity-80 md:inline-flex">
            <CornerDownLeftIcon className="size-3" />
          </Kbd>
        </Button>
      </div>
    </form>
  );
}

function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-5 items-center rounded border px-1", className)}>{children}</kbd>;
}

export function TransactionDialog() {
  const isOpen = useTransactionDialogStore((state) => state.isOpen);
  const openRevision = useTransactionDialogStore((state) => state.openRevision);
  const closeDialog = useTransactionDialogStore((state) => state.close);
  const isCreating = useTransactionDialogStore((state) => state.mode === "create");
  const amountInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog();
  };
  const content = <TransactionDialogContent key={openRevision} amountInputRef={amountInputRef} />;

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent
          ref={popupRef}
          showCloseButton={false}
          initialFocus={isCreating ? amountInputRef : popupRef}
          className="sm:max-w-[30rem]"
        >
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // Focusing the amount input while the drawer animates in opens the keyboard mid-measure,
  // before the keyboard provider is listening, so the drawer can settle at the wrong height.
  return (
    <Drawer
      open={isOpen}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(open) => {
        if (open && isCreating && document.activeElement === popupRef.current) amountInputRef.current?.focus();
      }}
      showSwipeHandle
    >
      <DrawerVirtualKeyboardProvider>
        <DrawerContent ref={popupRef} initialFocus={popupRef}>
          <div className="min-h-0 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-width:none]">
            {content}
          </div>
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
