import { useAccounts } from "@productivity/core/data/accounts";
import {
  useCategoryImportanceCounts,
  useRecentTransactionCategories,
  useTransaction,
} from "@productivity/core/data/transactions";
import { IMPORTANCE_LABELS } from "@productivity/core/finance/appearance";
import { inferCategoryImportance } from "@productivity/core/finance/category-importance";
import { formatTransferRate } from "@productivity/core/finance/transfer-rate";
import {
  createTransaction,
  deleteTransaction,
  IMPORTANCE_TIERS,
  type ImportanceTier,
  TRANSACTION_TYPES,
  type TransactionInput,
  type TransactionRow,
  type TransactionType,
  updateTransaction,
} from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, type TextInputInstance, View } from "react-native";
import { ActionButton } from "../../../components/action-button";
import { useAskAssistant, useAssistantEnabled } from "../../../components/assistant-button";
import { DateTimeField } from "../../../components/date-time-field";
import { SheetHeader } from "../../../components/screen-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { FieldError, FormRow, FormSection } from "../../../components/ui/form";
import { Icon } from "../../../components/ui/icon";
import { Input } from "../../../components/ui/input";
import { KeyboardScreen } from "../../../components/ui/keyboard-screen";
import { Segmented } from "../../../components/ui/segmented";
import { SelectField } from "../../../components/ui/select-sheet";
import { parseAmountInput, TRANSACTION_TYPE_STYLE } from "../../../lib/finance";
import { cn } from "../../../lib/utils";

const DEFAULT_IMPORTANCE: ImportanceTier = "flexible";

const TYPE_OPTIONS = TRANSACTION_TYPES.map((type) => ({
  value: type,
  label: TRANSACTION_TYPE_STYLE[type].shortLabel,
}));
const IMPORTANCE_OPTIONS = IMPORTANCE_TIERS.map((tier) => ({ value: tier, label: IMPORTANCE_LABELS[tier] }));

const TITLE_PLACEHOLDER: Record<TransactionType, string> = {
  expense: "What was it?",
  income: "Where from?",
  transfer: "Between accounts",
  adjustment: "Manual correction",
};

/** Typing a sign into the amount: "-" or "+" anywhere in it, as the web's amount input reads it. */
function typedSign(text: string): "+" | "-" | null {
  if (/[-\u2212]/.test(text)) return "-";
  if (text.includes("+")) return "+";
  return null;
}

type FormState = {
  type: TransactionType;
  accountId: string;
  counterpartyAccountId: string;
  amount: string;
  counterpartyAmount: string;
  effectiveAt: Date;
  title: string;
  category: string;
  importance: ImportanceTier | null;
  notes: string;
};

export default function TransactionScreen() {
  // `type` presets a new entry, as the overview's Expense / Income / Transfer actions do.
  const { id, accountId, type } = useLocalSearchParams<{ id: string; accountId?: string; type?: string }>();
  const router = useRouter();
  const isNew = id === "new";
  const existing = useTransaction(isNew ? null : id);
  const accounts = useAccounts();

  if (!isNew && !existing) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title="Transaction" onDone={() => router.back()} />
        <EmptyState icon="slash" title="This transaction no longer exists" />
      </View>
    );
  }
  if (accounts.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title="Transaction" onDone={() => router.back()} />
        <EmptyState icon="credit-card" title="Add an account first" />
      </View>
    );
  }
  return (
    <TransactionForm
      existing={existing}
      defaultAccountId={accountId || accounts[0]?.id || ""}
      defaultType={
        (TRANSACTION_TYPES as readonly string[]).includes(type ?? "") ? (type as TransactionType) : "expense"
      }
    />
  );
}

function initialState(
  existing: TransactionRow | undefined,
  defaultAccountId: string,
  otherAccountId: string,
  defaultType: TransactionType,
) {
  return {
    type: (existing?.type as TransactionType | undefined) ?? defaultType,
    accountId: existing?.accountId ?? defaultAccountId,
    counterpartyAccountId: existing?.counterpartyAccountId || otherAccountId,
    amount: existing
      ? existing.type === "adjustment"
        ? String(existing.amount)
        : String(Math.abs(Number(existing.amount)))
      : "",
    counterpartyAmount: existing?.counterpartyAmount != null ? String(Math.abs(existing.counterpartyAmount)) : "",
    effectiveAt: new Date(existing?.effectiveAt ?? Date.now()),
    title: existing?.title ?? "",
    category: existing?.category ?? "",
    importance: (existing?.importance as ImportanceTier | null | undefined) ?? (existing ? null : DEFAULT_IMPORTANCE),
    notes: existing?.notes ?? "",
  } satisfies FormState;
}

function validate(form: FormState, needsCounterpartyAmount: boolean, accountCount: number): string | null {
  const amount = parseAmountInput(form.amount);
  if (form.type === "transfer" && accountCount < 2) return "Create at least two accounts before recording a transfer.";
  if (!form.accountId) return "Pick an account.";
  if (form.type === "adjustment") {
    if (!Number.isFinite(amount) || amount === 0) return "Enter a non-zero amount.";
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than 0.";
  if (form.type === "transfer") {
    if (!form.counterpartyAccountId) return "Pick the destination account.";
    if (form.counterpartyAccountId === form.accountId) return "Transfer accounts must be different.";
    const received = parseAmountInput(form.counterpartyAmount);
    if (needsCounterpartyAmount && (!Number.isFinite(received) || received <= 0)) {
      return "Enter the amount received.";
    }
  }
  return null;
}

function toInput(form: FormState, needsCounterpartyAmount: boolean): TransactionInput {
  const base = {
    accountId: form.accountId,
    effectiveAt: form.effectiveAt.getTime(),
    title: form.title,
    notes: form.notes,
    amount: parseAmountInput(form.amount),
  };
  switch (form.type) {
    case "expense":
      return { ...base, type: "expense", category: form.category, importance: form.importance };
    case "income":
      return { ...base, type: "income", category: form.category };
    case "adjustment":
      return { ...base, type: "adjustment", category: form.category };
    case "transfer":
      return {
        ...base,
        type: "transfer",
        counterpartyAccountId: form.counterpartyAccountId,
        counterpartyAmount: needsCounterpartyAmount ? parseAmountInput(form.counterpartyAmount) : base.amount,
      };
  }
}

function TransactionForm({
  existing,
  defaultAccountId,
  defaultType,
}: {
  existing: TransactionRow | undefined;
  defaultAccountId: string;
  defaultType: TransactionType;
}) {
  const db = useDb();
  const router = useRouter();
  const assistantEnabled = useAssistantEnabled();
  const ask = useAskAssistant();
  const accounts = useAccounts();
  const categories = useRecentTransactionCategories();
  const importanceRows = useCategoryImportanceCounts();
  const otherAccountId = accounts.find((account) => account.id !== defaultAccountId)?.id ?? "";
  const [initial] = useState<FormState>(() => initialState(existing, defaultAccountId, otherAccountId, defaultType));
  const [form, setForm] = useState<FormState>(initial);
  const [importanceTouched, setImportanceTouched] = useState(existing != null);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const amountRef = useRef<TextInputInstance>(null);

  const importanceByCategory = useMemo(() => inferCategoryImportance(importanceRows), [importanceRows]);

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.labelText || "Untitled",
    description: account.currency,
  }));
  const source = accounts.find((account) => account.id === form.accountId);
  const destination = accounts.find((account) => account.id === form.counterpartyAccountId);
  const needsCounterpartyAmount =
    form.type === "transfer" && source != null && destination != null && source.currency !== destination.currency;

  // As on the web, an untouched edit can't be saved, so it doesn't rewrite the row (and its sync timestamp).
  const unchanged = existing != null && isSameForm(form, initial);
  const canTransfer = accounts.length >= 2;

  const update = (patch: Partial<FormState>) => {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const changeCategory = (category: string) => {
    const suggested = importanceByCategory.get(category.trim()) ?? DEFAULT_IMPORTANCE;
    update(importanceTouched ? { category } : { category, importance: suggested });
  };

  const changeType = (type: TransactionType) => {
    update({ type, amount: type !== "adjustment" ? form.amount.replace(/^-/, "") : form.amount });
  };

  const isNegative = form.amount.startsWith("-");

  const changeAmount = (text: string) => {
    const sign = typedSign(text);
    const amount = text.replace(/[-+\u2212]/g, "");
    if (form.type === "adjustment") {
      update({ amount: (sign ? sign === "-" : isNegative) && amount ? `-${amount}` : amount });
    } else if (sign && (form.type === "expense" || form.type === "income")) {
      // As on the web, typing a sign flips an expense to income and back.
      update({ amount, type: sign === "+" ? "income" : "expense" });
    } else {
      update({ amount });
    }
  };

  const toggleSign = () => {
    if (form.type === "adjustment") {
      update({ amount: isNegative ? form.amount.slice(1) : `-${form.amount}` });
    } else if (form.type === "expense" || form.type === "income") {
      changeType(form.type === "expense" ? "income" : "expense");
    }
  };

  const swapAccounts = () =>
    update({
      accountId: form.counterpartyAccountId,
      counterpartyAccountId: form.accountId,
      amount: needsCounterpartyAmount ? form.counterpartyAmount : form.amount,
      counterpartyAmount: needsCounterpartyAmount ? form.amount : form.counterpartyAmount,
    });

  /** Validates and writes the form; false (with the error shown) when it can't be saved. */
  const persist = () => {
    if (unchanged) return true;
    const message = validate(form, needsCounterpartyAmount, accounts.length);
    if (message) {
      setError(message);
      return false;
    }
    try {
      const input = toInput(form, needsCounterpartyAmount);
      if (existing) updateTransaction(db.db, existing.id, input);
      else createTransaction(db.db, input);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  };

  const save = (addAnother = false) => {
    if (unchanged || !persist()) return;
    if (!existing && addAnother) {
      // Keeps the type, accounts, category and date for a run of similar entries, as the web's
      // "Create & add another" does.
      update({ amount: "", counterpartyAmount: "", title: "", notes: "" });
      setSavedCount((count) => count + 1);
      amountRef.current?.focus();
      return;
    }
    router.back();
  };

  // The assistant reads the synced row, so pending edits are saved first rather than lost.
  const askAssistant = () => {
    if (existing && persist()) ask({ table: "transaction_entry", id: existing.id });
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert("Delete transaction?", "The account balance is updated to match.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteTransaction(db.db, existing.id);
          router.back();
        },
      },
    ]);
  };

  const currency = source?.currency ?? "";
  const rate =
    needsCounterpartyAmount && source && destination
      ? formatTransferRate(
          parseAmountInput(form.amount),
          parseAmountInput(form.counterpartyAmount),
          source.currency,
          destination.currency,
        )
      : null;
  const sign =
    form.type === "expense"
      ? "−"
      : form.type === "income"
        ? "+"
        : form.type === "adjustment"
          ? isNegative
            ? "−"
            : "+"
          : null;
  const signLabel =
    form.type === "expense"
      ? "Switch to income"
      : form.type === "income"
        ? "Switch to expense"
        : isNegative
          ? "Make positive"
          : "Make negative";

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title={existing ? "Edit transaction" : "New transaction"}
          onCancel={() => router.back()}
          onDone={() => save()}
          doneLabel="Save"
          doneDisabled={unchanged || (form.type === "transfer" && !canTransfer)}
        />
      }
    >
      <Segmented options={TYPE_OPTIONS} value={form.type} onChange={changeType} />

      <View className="items-center gap-1 py-2">
        <View className="flex-row items-center gap-1">
          {sign && (
            // The +/− shortcut: flips an expense to income and back, or an adjustment's direction.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={signLabel}
              onPress={toggleSign}
              hitSlop={8}
              className="h-12 min-w-10 items-center justify-center rounded-lg bg-muted px-2 active:opacity-60"
            >
              <Text className={cn("font-semibold text-3xl", TRANSACTION_TYPE_STYLE[form.type].accent)}>{sign}</Text>
            </Pressable>
          )}
          <Input
            ref={amountRef}
            accessibilityLabel={form.type === "adjustment" ? "Balance change" : "Amount"}
            value={form.amount.replace(/^-/, "")}
            onChangeText={changeAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            className={`min-w-24 text-center font-semibold text-4xl ${TRANSACTION_TYPE_STYLE[form.type].accent}`}
            autoFocus={!existing}
          />
          <Text className="font-medium text-muted-foreground text-xl">{currency}</Text>
        </View>
        {form.type === "adjustment" && (
          <Text className="text-muted-foreground text-xs">
            Tap {isNegative ? "−" : "+"} to lower or raise the balance.
          </Text>
        )}
        {savedCount > 0 && !existing && (
          <Text className="text-emerald-600 text-xs dark:text-emerald-400">
            Saved {savedCount} {savedCount === 1 ? "entry" : "entries"} · add the next one
          </Text>
        )}
      </View>

      {form.type === "transfer" && !canTransfer && (
        <Text className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Transfers require at least two accounts.
        </Text>
      )}

      {form.type === "transfer" && canTransfer && (
        <View className="-mb-3 flex-row items-center justify-between px-1">
          <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Accounts</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap accounts"
            onPress={swapAccounts}
            hitSlop={8}
            className="flex-row items-center gap-1 active:opacity-60"
          >
            <Icon name="repeat" size={13} colorClassName="accent-blue-600 dark:accent-blue-400" />
            <Text className="font-medium text-blue-600 text-sm dark:text-blue-400">Swap</Text>
          </Pressable>
        </View>
      )}
      <FormSection>
        <SelectField
          label={form.type === "transfer" && canTransfer ? "From" : "Account"}
          value={form.accountId}
          options={accountOptions}
          onChange={(accountId) => update({ accountId })}
          last={form.type !== "transfer" || !canTransfer}
        />
        {form.type === "transfer" && canTransfer && (
          <SelectField
            label="To"
            value={form.counterpartyAccountId}
            options={accountOptions}
            onChange={(counterpartyAccountId) => update({ counterpartyAccountId })}
            last={!needsCounterpartyAmount}
          />
        )}
        {needsCounterpartyAmount && (
          <FormRow label="Received" last>
            <Input
              value={form.counterpartyAmount}
              onChangeText={(counterpartyAmount) => update({ counterpartyAmount })}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="h-10 min-w-24 text-right"
            />
            <Text className="text-base text-muted-foreground">{destination?.currency}</Text>
          </FormRow>
        )}
      </FormSection>
      {rate && <Text className="-mt-3 px-1 text-center text-muted-foreground text-xs">{rate}</Text>}

      <FormSection>
        <FormRow label="Title">
          <Input
            value={form.title}
            onChangeText={(title) => update({ title })}
            placeholder={TITLE_PLACEHOLDER[form.type]}
            className="h-10 min-w-40 text-right"
          />
        </FormRow>
        {form.type !== "transfer" && (
          <SelectField
            label="Category"
            value={form.category}
            options={categories.map((category) => ({ value: category, label: category }))}
            onChange={changeCategory}
            placeholder="None"
            allowCustom
            clearLabel="No category"
          />
        )}
        <FormRow label="Date">
          <DateTimeField
            mode="date"
            value={form.effectiveAt}
            onChange={(day) => update({ effectiveAt: withDate(form.effectiveAt, day) })}
          />
          <DateTimeField
            mode="time"
            value={form.effectiveAt}
            onChange={(time) => update({ effectiveAt: withTime(form.effectiveAt, time) })}
          />
        </FormRow>
        <View className="px-4 py-1">
          <Input
            value={form.notes}
            onChangeText={(notes) => update({ notes })}
            placeholder="Notes"
            className="min-h-10"
            multiline
          />
        </View>
      </FormSection>

      {form.type === "expense" && (
        <View className="gap-2">
          <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Importance</Text>
          <Segmented
            options={IMPORTANCE_OPTIONS}
            value={form.importance ?? ("" as ImportanceTier)}
            onChange={(importance) => {
              setImportanceTouched(true);
              update({ importance });
            }}
          />
        </View>
      )}

      <FieldError message={error} />

      {existing ? (
        <View className="flex-row gap-3">
          {assistantEnabled && <ActionButton icon="message-circle" label="Ask assistant" onPress={askAssistant} />}
          <ActionButton icon="trash-2" label="Delete" destructive onPress={confirmDelete} />
        </View>
      ) : (
        <View className="flex-row">
          <ActionButton icon="plus" label="Create & add another" onPress={() => save(true)} />
        </View>
      )}
    </KeyboardScreen>
  );
}

function isSameForm(a: FormState, b: FormState) {
  return (Object.keys(a) as (keyof FormState)[]).every((key) =>
    key === "effectiveAt" ? a.effectiveAt.getTime() === b.effectiveAt.getTime() : a[key] === b[key],
  );
}

function withDate(current: Date, day: Date) {
  const next = new Date(current);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return next;
}

function withTime(current: Date, time: Date) {
  const next = new Date(current);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return next;
}
