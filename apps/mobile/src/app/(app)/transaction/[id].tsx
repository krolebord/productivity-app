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
import { format, isSameYear, isToday, isYesterday } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type RefObject, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Platform, Pressable, Text, type TextInputInstance, View } from "react-native";
import { useAskAssistant, useAssistantEnabled } from "../../../components/assistant-button";
import { DateTimeSheet } from "../../../components/date-time-field";
import { EditorShell } from "../../../components/item-editor";
import { SheetHeader } from "../../../components/screen-header";
import { ActionSheet, type ActionSheetItem } from "../../../components/ui/action-sheet";
import { Button } from "../../../components/ui/button";
import { PickerChip } from "../../../components/ui/chip";
import { EmptyState } from "../../../components/ui/empty-state";
import { FieldError } from "../../../components/ui/form";
import { Icon, MaterialIcon } from "../../../components/ui/icon";
import { IconButton } from "../../../components/ui/icon-button";
import { Input } from "../../../components/ui/input";
import { ColorDot, SelectSheet } from "../../../components/ui/select-sheet";
import { IMPORTANCE_STYLE, parseAmountInput, TRANSACTION_TYPE_STYLE } from "../../../lib/finance";
import { cn } from "../../../lib/utils";

const DEFAULT_IMPORTANCE: ImportanceTier = "flexible";

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

/** Which chip's sheet is open; the account sheet serves both sides of a transfer. */
type Picker = "account" | "category" | "importance" | "date";
type AccountPickerTarget = { field: "accountId" | "counterpartyAccountId"; title: string };

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
  const [showNotes, setShowNotes] = useState(Boolean(existing?.notes));
  const [picker, setPicker] = useState<Picker | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Outlives `picker`, so the account sheet's title and checkmark don't change while it slides out.
  const [accountTarget, setAccountTarget] = useState<AccountPickerTarget>({ field: "accountId", title: "Account" });
  const receivedRef = useRef<TextInputInstance>(null);
  const amountRef = useRef<TextInputInstance>(null);
  const titleRef = useRef<TextInputInstance>(null);
  const notesRef = useRef<TextInputInstance>(null);
  // A new entry opens on the amount with the decimal pad up. `autoFocus`, not `focus()` on mount:
  // Android only opens the keyboard for a field focused once it's attached, which `autoFocus` waits
  // for. Keep it constant: Android reads it at attach time, so turning it off right after the first
  // render cancels it. It also refocuses the amount when a transfer switches between one and two
  // amounts, which is where typing continues anyway.
  const autoFocusAmount = !existing;

  const importanceByCategory = useMemo(() => inferCategoryImportance(importanceRows), [importanceRows]);

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.labelText || "Untitled",
    description: account.currency,
    leading: <ColorDot color={account.labelColor} />,
  }));
  const categoryOptions = categories.map((category) => ({ value: category, label: category }));
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

  // The keyboard stays with its field: both platforms hide it while a picker is up and show it again
  // once the picker closes, so typing carries on where it was (PickerScreen handles that on iOS).
  const openPicker = (next: Picker) => setPicker(next);
  const closePicker = () => setPicker(null);
  const focusTitle = () => titleRef.current?.focus();

  const revealNotes = () => {
    setShowNotes(true);
    requestAnimationFrame(() => notesRef.current?.focus());
  };

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

  // An adjustment can raise or lower the balance; expenses and income take their sign from the type.
  const toggleSign = () => update({ amount: isNegative ? form.amount.slice(1) : `-${form.amount}` });

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
      setShowNotes(false);
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

  const typeStyle = TRANSACTION_TYPE_STYLE[form.type];
  const transferring = form.type === "transfer" && canTransfer;
  const rate =
    needsCounterpartyAmount && source && destination
      ? formatTransferRate(
          parseAmountInput(form.amount),
          parseAmountInput(form.counterpartyAmount),
          source.currency,
          destination.currency,
        )
      : null;
  const sign = form.type === "adjustment" ? (isNegative ? "−" : "+") : null;
  const signLabel = isNegative ? "Make positive" : "Make negative";
  const menuItems: ActionSheetItem[] = [
    ...(assistantEnabled ? [{ label: "Ask assistant", icon: "message-circle" as const, onPress: askAssistant }] : []),
    { label: "Delete transaction", icon: "trash-2", destructive: true, onPress: confirmDelete },
  ];
  const saveDisabled = unchanged || (form.type === "transfer" && !canTransfer);
  const importanceStyle = form.importance ? IMPORTANCE_STYLE[form.importance] : null;

  // The chips leave out the currency: the amount above them shows it.
  const accountChip = (field: AccountPickerTarget["field"], title: string) => {
    const account = accounts.find((item) => item.id === form[field]);
    return (
      <PickerChip
        label={account ? account.labelText || "Untitled" : "Account"}
        accessibilityLabel={`${title}: ${account ? `${account.labelText || "Untitled"}, ${account.currency}` : "none"}`}
        leading={account && <View className="size-2 rounded-full" style={{ backgroundColor: account.labelColor }} />}
        chevron={account != null}
        empty={!account}
        onPress={() => {
          setAccountTarget({ field, title });
          openPicker("account");
        }}
      />
    );
  };

  return (
    <EditorShell
      contentClassName="px-4 pt-4"
      toolbarClassName="gap-3"
      header={
        <SheetHeader
          title={screenTitle(existing != null, form.type)}
          onCancel={() => router.back()}
          actions={
            existing && (
              <IconButton
                icon="more-vertical"
                label="More actions"
                onPress={() => {
                  Keyboard.dismiss();
                  setMenuOpen(true);
                }}
                size={22}
              />
            )
          }
        />
      }
      // Save sits on the keyboard, under the thumb: this is the form people fill in most, often several in a row.
      toolbar={
        <>
          {!existing && (
            <View className="flex-1">
              <Button
                variant="outline"
                label="Add another"
                accessibilityLabel="Save and add another"
                onPress={() => save(true)}
                disabled={saveDisabled}
              />
            </View>
          )}
          <View className="flex-1">
            <Button label="Save" onPress={() => save()} disabled={saveDisabled} />
          </View>
        </>
      }
    >
      <TypeToggle value={form.type} onChange={changeType} />

      {needsCounterpartyAmount ? (
        <View className="items-center gap-3">
          <View className="w-full flex-row items-start gap-2">
            <View className="min-w-0 flex-1 items-center gap-2">
              <AmountInput
                inputRef={amountRef}
                autoFocus={autoFocusAmount}
                label={`Sent amount (${source?.currency})`}
                value={form.amount}
                onChangeText={changeAmount}
                currency={source?.currency}
                className="text-3xl"
                onSubmitEditing={() => receivedRef.current?.focus()}
              />
              {accountChip("accountId", "From account")}
            </View>
            <SwapButton onPress={swapAccounts} />
            <View className="min-w-0 flex-1 items-center gap-2">
              <AmountInput
                inputRef={receivedRef}
                label={`Received amount (${destination?.currency})`}
                value={form.counterpartyAmount}
                onChangeText={(counterpartyAmount) => update({ counterpartyAmount })}
                currency={destination?.currency}
                className="text-3xl"
                onSubmitEditing={focusTitle}
              />
              {accountChip("counterpartyAccountId", "To account")}
            </View>
          </View>
          {rate && <Text className="text-muted-foreground text-xs tabular-nums">{rate}</Text>}
        </View>
      ) : (
        <View className="items-center gap-3">
          <View className="max-w-full flex-row items-center justify-center gap-1">
            {sign && (
              // The +/− shortcut: flips an expense to income and back, or an adjustment's direction.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={signLabel}
                onPress={toggleSign}
                hitSlop={8}
                className="h-14 min-w-11 items-center justify-center rounded-lg bg-muted/70 px-2 active:opacity-60"
              >
                <Text className={cn("font-semibold text-4xl", typeStyle.accent)}>{sign}</Text>
              </Pressable>
            )}
            <AmountInput
              inputRef={amountRef}
              autoFocus={autoFocusAmount}
              label={form.type === "adjustment" ? "Balance change" : "Amount"}
              value={form.amount.replace(/^-/, "")}
              onChangeText={changeAmount}
              currency={source?.currency}
              className={cn("text-5xl", typeStyle.accent)}
              onSubmitEditing={focusTitle}
            />
          </View>
          <View className="max-w-full flex-row items-center justify-center gap-1.5">
            {accountChip("accountId", transferring ? "From account" : "Account")}
            {transferring && (
              <>
                <SwapButton onPress={swapAccounts} />
                {accountChip("counterpartyAccountId", "To account")}
              </>
            )}
          </View>
        </View>
      )}

      {(form.type === "adjustment" || (savedCount > 0 && !existing)) && (
        <View className="-mt-2 items-center gap-1">
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
      )}

      {form.type === "transfer" && !canTransfer && (
        <Text className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Transfers require at least two accounts.
        </Text>
      )}

      <View className="gap-3">
        <Input
          ref={titleRef}
          accessibilityLabel="Title"
          value={form.title}
          onChangeText={(title) => update({ title })}
          placeholder={TITLE_PLACEHOLDER[form.type]}
          placeholderTextColorClassName="accent-muted-foreground/70"
          returnKeyType="done"
          className={cn("h-11 rounded-lg px-3 text-center font-medium text-lg", !form.title && "bg-muted/50")}
        />

        <View className="flex-row flex-wrap justify-center gap-2">
          {form.type !== "transfer" && (
            <PickerChip
              label={form.category || "Category"}
              icon={form.category ? "tag" : undefined}
              accessibilityLabel={`Category: ${form.category || "none"}`}
              empty={!form.category}
              onPress={() => openPicker("category")}
            />
          )}
          {form.type === "expense" && (
            <PickerChip
              label={importanceStyle?.label ?? "Importance"}
              accessibilityLabel={`Importance: ${importanceStyle?.label ?? "none"}`}
              leading={importanceStyle && <View className={cn("size-1.5 rounded-full", importanceStyle.dot)} />}
              empty={!importanceStyle}
              className={importanceStyle?.badge}
              textClassName={importanceStyle?.badgeText}
              onPress={() => openPicker("importance")}
            />
          )}
          <PickerChip
            label={`${formatChipDate(form.effectiveAt)} · ${format(form.effectiveAt, "HH:mm")}`}
            icon="calendar"
            accessibilityLabel={`Date: ${format(form.effectiveAt, "PPPp")}`}
            textClassName="text-muted-foreground"
            iconClassName="accent-muted-foreground"
            onPress={() => openPicker("date")}
          />
          {!showNotes && <PickerChip label="Note" empty onPress={revealNotes} />}
        </View>

        {showNotes && (
          <Input
            ref={notesRef}
            accessibilityLabel="Note"
            value={form.notes}
            onChangeText={(notes) => update({ notes })}
            placeholder="Note"
            multiline
            textAlignVertical="top"
            className={cn("min-h-11 rounded-lg px-3 py-2.5 text-center text-base", !form.notes && "bg-muted/50")}
          />
        )}
      </View>

      <FieldError message={error} className="-mt-1 text-center" />

      <ActionSheet
        visible={menuOpen}
        title="Transaction actions"
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      <SelectSheet
        visible={picker === "account"}
        title={accountTarget.title}
        value={form[accountTarget.field]}
        options={accountOptions}
        onClose={closePicker}
        onSelect={(value) => {
          update({ [accountTarget.field]: value });
          closePicker();
        }}
      />
      <SelectSheet
        visible={picker === "category"}
        title="Category"
        value={form.category}
        options={categoryOptions}
        allowCustom
        clearLabel="No category"
        onClose={closePicker}
        onSelect={(category) => {
          changeCategory(category);
          closePicker();
        }}
      />
      <SelectSheet
        visible={picker === "importance"}
        title="Importance"
        value={form.importance ?? ""}
        options={IMPORTANCE_OPTIONS}
        onClose={closePicker}
        onSelect={(importance) => {
          setImportanceTouched(true);
          update({ importance: importance as ImportanceTier });
          closePicker();
        }}
      />
      <DateTimeSheet
        visible={picker === "date"}
        value={form.effectiveAt}
        onChange={(effectiveAt) => update({ effectiveAt })}
        onClose={closePicker}
      />
    </EditorShell>
  );
}

/** Expense / Income / Transfer / Adjust, each with its icon and tinted when active, as on the web. */
function TypeToggle({ value, onChange }: { value: TransactionType; onChange: (type: TransactionType) => void }) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row gap-0.5 rounded-lg bg-muted p-0.5">
      {TRANSACTION_TYPES.map((type) => {
        const style = TRANSACTION_TYPE_STYLE[type];
        const active = type === value;
        // Adjustments are rare, so the fourth option is icon-only to keep the labels readable.
        const iconOnly = type === "adjustment";
        return (
          <Pressable
            key={type}
            accessibilityRole="radio"
            accessibilityLabel={style.label}
            accessibilityState={{ checked: active }}
            onPress={() => onChange(type)}
            className={cn(
              "h-10 flex-row items-center justify-center gap-1.5 rounded-md",
              iconOnly ? "w-12" : "flex-1 px-2",
              active && "bg-background shadow-sm",
            )}
          >
            <Icon name={style.icon} size={14} colorClassName={active ? style.iconAccent : "accent-muted-foreground"} />
            {!iconOnly && (
              <Text
                numberOfLines={1}
                className={cn("font-medium text-sm", active ? style.accent : "text-muted-foreground")}
              >
                {style.shortLabel}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// Android pads text for accents by default; off on both, so the input matches the copy measuring it.
const noFontPadding = { includeFontPadding: false };

/**
 * A large amount with its currency after it. The input sizes to what's typed via a hidden copy of
 * the text: a TextInput sized by its content keeps its old width once cleared ("Create & add another").
 */
function AmountInput({
  inputRef,
  label,
  value,
  onChangeText,
  currency,
  className,
  onSubmitEditing,
  autoFocus = false,
}: {
  inputRef?: RefObject<TextInputInstance | null>;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  currency?: string;
  className?: string;
  /** Where the keypad's Next key goes, on Android. */
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}) {
  const textClassName = cn("font-semibold tabular-nums", className);
  return (
    <View className="min-w-0 max-w-full shrink flex-row items-center justify-center gap-1">
      {/* At least a comfortable tap target while it only shows the "0" placeholder. */}
      <View className="min-h-11 min-w-16 shrink justify-center">
        <Text
          numberOfLines={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={noFontPadding}
          className={cn(textClassName, "px-1 opacity-0")}
        >
          {value || "0"}
        </Text>
        <Input
          ref={inputRef}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColorClassName="accent-muted-foreground/40"
          keyboardType="decimal-pad"
          // iOS 26 floats a Next key above the decimal pad, over the editor's Save bar; without a
          // return key type it shows none.
          returnKeyType={Platform.OS === "ios" ? undefined : "next"}
          onSubmitEditing={onSubmitEditing}
          autoFocus={autoFocus}
          style={noFontPadding}
          className={cn("absolute inset-0 p-0 text-center", textClassName)}
        />
      </View>
      {currency && <Text className="text-base text-muted-foreground">{currency}</Text>}
    </View>
  );
}

function SwapButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Swap accounts"
      onPress={onPress}
      hitSlop={4}
      className="size-10 items-center justify-center rounded-lg bg-muted active:opacity-60"
    >
      <MaterialIcon name="swap-horizontal" size={20} colorClassName="accent-blue-600 dark:accent-blue-400" />
    </Pressable>
  );
}

function screenTitle(editing: boolean, type: TransactionType) {
  if (editing) return type === "adjustment" ? "Edit adjustment" : "Edit transaction";
  return `New ${TRANSACTION_TYPE_STYLE[type].label.toLowerCase()}`;
}

/** "Today", "Yesterday", "Oct 28" or "Oct 28, 2025", as the web's date chip reads. */
function formatChipDate(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isSameYear(date, new Date()) ? "MMM d" : "MMM d, yyyy");
}

function isSameForm(a: FormState, b: FormState) {
  return (Object.keys(a) as (keyof FormState)[]).every((key) =>
    key === "effectiveAt" ? a.effectiveAt.getTime() === b.effectiveAt.getTime() : a[key] === b[key],
  );
}
