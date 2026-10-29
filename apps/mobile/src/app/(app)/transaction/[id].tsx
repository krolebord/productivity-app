import { useAccounts } from "@productivity/core/data/accounts";
import {
  useCategoryImportanceCounts,
  useRecentTransactionCategories,
  useTransaction,
} from "@productivity/core/data/transactions";
import { IMPORTANCE_LABELS } from "@productivity/core/finance/appearance";
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
import { useMemo, useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { ActionButton } from "../../../components/action-button";
import { DateTimeField } from "../../../components/date-time-field";
import { SheetHeader } from "../../../components/screen-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { FieldError, FormRow, FormSection } from "../../../components/ui/form";
import { Input } from "../../../components/ui/input";
import { KeyboardScreen } from "../../../components/ui/keyboard-screen";
import { Segmented } from "../../../components/ui/segmented";
import { SelectField } from "../../../components/ui/select-sheet";
import { parseAmountInput, TRANSACTION_TYPE_STYLE } from "../../../lib/finance";

const DEFAULT_IMPORTANCE: ImportanceTier = "flexible";

const TYPE_OPTIONS = TRANSACTION_TYPES.map((type) => ({
  value: type,
  label: TRANSACTION_TYPE_STYLE[type].shortLabel,
}));
const IMPORTANCE_OPTIONS = IMPORTANCE_TIERS.map((tier) => ({ value: tier, label: IMPORTANCE_LABELS[tier] }));

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
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>();
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
  return <TransactionForm existing={existing} defaultAccountId={accountId || accounts[0]?.id || ""} />;
}

function initialState(existing: TransactionRow | undefined, defaultAccountId: string, otherAccountId: string) {
  return {
    type: (existing?.type as TransactionType | undefined) ?? "expense",
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
}: {
  existing: TransactionRow | undefined;
  defaultAccountId: string;
}) {
  const db = useDb();
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useRecentTransactionCategories();
  const importanceRows = useCategoryImportanceCounts();
  const otherAccountId = accounts.find((account) => account.id !== defaultAccountId)?.id ?? "";
  const [initial] = useState<FormState>(() => initialState(existing, defaultAccountId, otherAccountId));
  const [form, setForm] = useState<FormState>(initial);
  const [importanceTouched, setImportanceTouched] = useState(existing != null);
  const [error, setError] = useState<string | null>(null);

  const importanceByCategory = useMemo(() => {
    const best = new Map<string, { importance: ImportanceTier; count: number }>();
    for (const row of importanceRows) {
      if (!row.importance) continue;
      const count = Number(row.count);
      const current = best.get(row.category);
      if (!current || count > current.count) best.set(row.category, { importance: row.importance, count });
    }
    return best;
  }, [importanceRows]);

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
    const suggested = importanceByCategory.get(category.trim())?.importance ?? DEFAULT_IMPORTANCE;
    update(importanceTouched ? { category } : { category, importance: suggested });
  };

  const changeType = (type: TransactionType) => {
    update({ type, amount: type !== "adjustment" ? form.amount.replace(/^-/, "") : form.amount });
  };

  const save = () => {
    if (unchanged) return;
    const message = validate(form, needsCounterpartyAmount, accounts.length);
    if (message) {
      setError(message);
      return;
    }
    try {
      const input = toInput(form, needsCounterpartyAmount);
      if (existing) updateTransaction(db.db, existing.id, input);
      else createTransaction(db.db, input);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
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

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title={existing ? "Edit transaction" : "New transaction"}
          onCancel={() => router.back()}
          onDone={save}
          doneLabel="Save"
          doneDisabled={unchanged || (form.type === "transfer" && !canTransfer)}
        />
      }
    >
      <Segmented options={TYPE_OPTIONS} value={form.type} onChange={changeType} />

      <View className="items-center gap-1 py-2">
        <View className="flex-row items-baseline gap-2">
          <Input
            value={form.amount}
            onChangeText={(amount) => update({ amount })}
            placeholder="0.00"
            keyboardType={
              form.type === "adjustment" && Platform.OS === "ios" ? "numbers-and-punctuation" : "decimal-pad"
            }
            className={`min-w-24 text-center font-semibold text-4xl ${TRANSACTION_TYPE_STYLE[form.type].accent}`}
            autoFocus={!existing}
          />
          <Text className="font-medium text-muted-foreground text-xl">{currency}</Text>
        </View>
        {form.type === "adjustment" && (
          <Text className="text-muted-foreground text-xs">Use a negative amount to lower the balance.</Text>
        )}
      </View>

      {form.type === "transfer" && !canTransfer && (
        <Text className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Transfers require at least two accounts.
        </Text>
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

      <FormSection>
        <FormRow label="Title">
          <Input
            value={form.title}
            onChangeText={(title) => update({ title })}
            placeholder={TRANSACTION_TYPE_STYLE[form.type].label}
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
        <View className="px-4 py-2">
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

      {existing && (
        <View className="flex-row">
          <ActionButton icon="trash-2" label="Delete" destructive onPress={confirmDelete} />
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
