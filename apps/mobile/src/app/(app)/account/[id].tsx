import { APP_CURRENCIES, type AppCurrencyCode } from "@productivity/core/currency/currencies";
import {
  createAccount,
  deleteAccount,
  updateAccount,
  useAccount,
  useAccountHasTransactions,
} from "@productivity/core/data/accounts";
import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
import type { AccountRow } from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ActionButton } from "../../../components/action-button";
import { SheetHeader } from "../../../components/screen-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { FieldError, FormRow, FormSection, FormSwitch } from "../../../components/ui/form";
import { Icon } from "../../../components/ui/icon";
import { Input } from "../../../components/ui/input";
import { KeyboardScreen } from "../../../components/ui/keyboard-screen";
import { SelectField } from "../../../components/ui/select-sheet";
import { parseAmountInput } from "../../../lib/finance";

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

const CURRENCY_OPTIONS = APP_CURRENCIES.map((code) => ({ value: code, label: code }));

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "new";
  const account = useAccount(isNew ? null : id);

  if (!isNew && !account) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title="Account" onDone={() => router.back()} />
        <EmptyState icon="slash" title="This account no longer exists" />
      </View>
    );
  }
  return <AccountForm account={account} />;
}

function AccountForm({ account }: { account: AccountRow | undefined }) {
  const db = useDb();
  const router = useRouter();
  const { baseCurrency } = useDashboardSettings();
  const hasTransactions = useAccountHasTransactions(account?.id);
  const [form, setForm] = useState({
    labelText: account?.labelText ?? "",
    currency: (account?.currency ?? baseCurrency) as string,
    balance: account ? String(account.balance) : "0",
    labelColor: account?.labelColor ?? LABEL_COLORS[0],
    description: account?.description ?? "",
    includeInTotals: !account?.excludeFromDashboard,
  });
  const [opened] = useState(form);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<typeof form>) => {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const save = () => {
    const balance = parseAmountInput(form.balance);
    if (!form.labelText.trim()) return setError("Name is required.");
    if (!Number.isFinite(balance)) return setError("Balance must be a number.");

    const fields = {
      labelText: form.labelText.trim(),
      currency: form.currency,
      // An untouched field keeps the live balance, so transactions that landed while the editor
      // was open (or synced in) aren't undone by an adjustment back to the stale value.
      balance: account && form.balance === opened.balance ? Number(account.balance) : balance,
      labelColor: form.labelColor,
      description: form.description.trim(),
    };
    // Same for the switch: an untouched one doesn't overwrite a visibility change synced in meanwhile.
    const visibility =
      form.includeInTotals === opened.includeInTotals ? {} : { excludeFromDashboard: !form.includeInTotals };
    if (account) updateAccount(db.db, account, { ...fields, ...visibility });
    else createAccount(db.db, fields);
    router.back();
  };

  const confirmDelete = () => {
    if (!account) return;
    if (hasTransactions) {
      Alert.alert("Account has transactions", "Delete or move its transactions before removing this account.");
      return;
    }
    Alert.alert("Delete account?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteAccount(db.db, account.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title={account ? "Edit account" : "New account"}
          onCancel={() => router.back()}
          onDone={save}
          doneLabel="Save"
        />
      }
    >
      <FormSection>
        <FormRow label="Name">
          <Input
            value={form.labelText}
            onChangeText={(labelText) => update({ labelText })}
            placeholder="e.g. Checking"
            className="h-10 min-w-40 text-right"
            autoFocus={!account}
          />
        </FormRow>
        <SelectField
          label="Currency"
          value={form.currency as AppCurrencyCode}
          options={CURRENCY_OPTIONS}
          onChange={(currency) => update({ currency })}
        />
        <FormRow label="Balance" last>
          <Input
            value={form.balance}
            onChangeText={(balance) => update({ balance })}
            keyboardType="numbers-and-punctuation"
            className="h-10 min-w-32 text-right"
          />
        </FormRow>
      </FormSection>
      {account && (
        <Text className="-mt-3 px-1 text-muted-foreground text-xs">
          Changing the balance records an adjustment transaction.
        </Text>
      )}

      <View className="gap-2">
        <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Color</Text>
        <View className="flex-row flex-wrap gap-3">
          {LABEL_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityLabel={color}
              accessibilityState={{ checked: form.labelColor === color }}
              onPress={() => update({ labelColor: color })}
              className="size-9 items-center justify-center rounded-full"
              style={{ backgroundColor: color }}
            >
              {form.labelColor === color && <Icon name="check" size={16} colorClassName="accent-white" />}
            </Pressable>
          ))}
        </View>
      </View>

      <FormSection title="Description">
        <Input
          value={form.description}
          onChangeText={(description) => update({ description })}
          placeholder="Optional"
          className="min-h-16 px-4 py-3"
          multiline
        />
      </FormSection>

      {account && (
        <FormSection footer="Hidden accounts are left out of net worth and the period totals.">
          <FormSwitch
            label="Include in totals"
            value={form.includeInTotals}
            onValueChange={(includeInTotals) => update({ includeInTotals })}
          />
          <FormRow
            label="View transactions"
            onPress={() =>
              router.push({ pathname: "/transactions", params: { accountId: account.id, presentation: "sheet" } })
            }
            last
          />
        </FormSection>
      )}

      <FieldError message={error} />

      {account && (
        <View className="flex-row">
          <ActionButton icon="trash-2" label="Delete account" destructive onPress={confirmDelete} />
        </View>
      )}
    </KeyboardScreen>
  );
}
