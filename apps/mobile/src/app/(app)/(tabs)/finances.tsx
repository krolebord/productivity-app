import type { AppCurrencyCode } from "@productivity/core/currency/currencies";
import { formatBalance } from "@productivity/core/currency/format";
import { resolveDashboardRange } from "@productivity/core/dashboard-range-store";
import { useAccounts } from "@productivity/core/data/accounts";
import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
import { useFlowTotalsByCurrency, useRecentTransactions } from "@productivity/core/data/transactions";
import { sumFlowTotals, sumNetWorth } from "@productivity/core/finance/overview";
import type { AccountRow } from "@productivity/core/transactions";
import { useRouter } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTabContentInset } from "../../../components/assistant-button";
import { ScreenHeader } from "../../../components/screen-header";
import { TransactionRow } from "../../../components/transaction-row";
import { EmptyState } from "../../../components/ui/empty-state";
import { FormSection } from "../../../components/ui/form";
import { IconButton } from "../../../components/ui/icon-button";
import { SelectField } from "../../../components/ui/select-sheet";
import { amountAccentClass, TRANSACTION_TYPE_STYLE, useDisplayCurrency } from "../../../lib/finance";
import { useCurrentDayKey } from "../../../lib/use-current-day";

const RECENT_LIMIT = 10;

export default function FinancesScreen() {
  const contentInset = useTabContentInset();
  const router = useRouter();
  const currentDayKey = useCurrentDayKey();
  const { mode, days, cycleDay } = useDashboardSettings();
  const { baseCurrency, setBaseCurrency, latestRate, convert, currencyOptions } = useDisplayCurrency();

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentDayKey only exists so the range rolls over at midnight.
  const range = useMemo(
    () => resolveDashboardRange({ mode, days, cycleDay }, new Date()),
    [mode, days, cycleDay, currentDayKey],
  );

  const accounts = useAccounts();
  const included = useMemo(() => accounts.filter((a) => !a.excludeFromDashboard), [accounts]);
  const excludedIds = useMemo(() => accounts.filter((a) => a.excludeFromDashboard).map((a) => a.id), [accounts]);
  const accountLabels = useMemo(() => new Map(accounts.map((a) => [a.id, a.labelText])), [accounts]);

  const rangeRows = useFlowTotalsByCurrency({
    start: range.rangeStart,
    end: range.rangeEnd,
    excludedAccountIds: excludedIds,
  });
  const prevRows = useFlowTotalsByCurrency({
    start: range.prevRangeStart,
    end: range.prevRangeEnd,
    excludedAccountIds: excludedIds,
  });
  const recent = useRecentTransactions({ limit: RECENT_LIMIT, excludedAccountIds: excludedIds });

  const { netWorth, unconvertibleAccounts } = sumNetWorth(included, convert);
  const flow = sumFlowTotals(rangeRows, convert);
  const prevFlow = sumFlowTotals(prevRows, convert);
  const netDelta = flow.net - prevFlow.net;

  const newTransaction = () => router.push({ pathname: "/transaction/[id]", params: { id: "new" } });
  const openAccount = (id: string) => router.push({ pathname: "/account/[id]", params: { id } });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Finances"
        subtitle={range.spanLabel}
        actions={
          accounts.length > 0 ? <IconButton icon="plus" label="New transaction" onPress={newTransaction} /> : null
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: contentInset }}
      >
        {accounts.length === 0 ? (
          <EmptyState
            icon="credit-card"
            title="No accounts yet"
            description="Add an account to start tracking balances and transactions."
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => openAccount("new")}
              className="mt-3 h-10 justify-center rounded-lg bg-primary px-4 active:opacity-80"
            >
              <Text className="font-medium text-primary-foreground">Add account</Text>
            </Pressable>
          </EmptyState>
        ) : (
          <>
            {!latestRate && (
              <Text className="rounded-lg border border-border border-dashed px-4 py-3 text-muted-foreground text-sm">
                No exchange rates stored yet. Totals only count accounts already in {baseCurrency}.
              </Text>
            )}

            <View className="gap-3">
              <SummaryCard
                label="Net worth"
                value={formatBalance(netWorth, baseCurrency)}
                footnote={`${included.length} account${included.length === 1 ? "" : "s"}${
                  unconvertibleAccounts > 0 ? ` · ${unconvertibleAccounts} not converted` : ""
                }`}
                large
              />
              <View className="flex-row gap-3">
                <SummaryCard
                  label={`Income · ${range.cardSuffix}`}
                  value={formatBalance(flow.income, baseCurrency)}
                  valueClassName={TRANSACTION_TYPE_STYLE.income.accent}
                />
                <SummaryCard
                  label={`Expenses · ${range.cardSuffix}`}
                  value={formatBalance(flow.expense, baseCurrency)}
                  valueClassName={TRANSACTION_TYPE_STYLE.expense.accent}
                />
              </View>
              <SummaryCard
                label={`Net · ${range.cardSuffix}`}
                value={formatBalance(flow.net, baseCurrency)}
                valueClassName={amountAccentClass(flow.net)}
                footnote={`${netDelta >= 0 ? "+" : ""}${formatBalance(netDelta, baseCurrency)} vs ${range.prevLabel}`}
              />
            </View>

            <Section
              title="Accounts"
              action={<IconButton icon="plus" label="New account" onPress={() => openAccount("new")} size={18} />}
            >
              <FormSection>
                {accounts.map((account, index) => (
                  <AccountRowView
                    key={account.id}
                    account={account}
                    converted={account.currency === baseCurrency ? null : convert(account.balance, account.currency)}
                    baseCurrency={baseCurrency}
                    onPress={() => openAccount(account.id)}
                    last={index === accounts.length - 1}
                  />
                ))}
              </FormSection>
            </Section>

            <Section
              title="Recent activity"
              action={
                <Pressable accessibilityRole="button" onPress={() => router.push("/transactions")} hitSlop={8}>
                  <Text className="font-medium text-primary text-sm">See all</Text>
                </Pressable>
              }
            >
              {recent.length === 0 ? (
                <Text className="px-1 text-muted-foreground text-sm">No transactions yet.</Text>
              ) : (
                <FormSection>
                  {recent.map((transaction, index) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      accountLabels={accountLabels}
                      onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: transaction.id } })}
                      last={index === recent.length - 1}
                    />
                  ))}
                </FormSection>
              )}
            </Section>

            <FormSection title="Display">
              <SelectField
                label="Currency"
                value={baseCurrency}
                options={currencyOptions.map((code) => ({ value: code, label: code }))}
                onChange={(code) => setBaseCurrency(code as AppCurrencyCode)}
                last
              />
            </FormSection>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className="h-8 flex-row items-center justify-between px-1">
        <Text className="font-semibold text-foreground text-lg">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName = "text-card-foreground",
  footnote,
  large = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  footnote?: string;
  large?: boolean;
}) {
  return (
    <View className="flex-1 rounded-xl border border-border bg-card p-4">
      <Text className="text-muted-foreground text-xs uppercase tracking-wide">{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        className={`mt-1.5 font-semibold ${large ? "text-3xl" : "text-xl"} ${valueClassName}`}
      >
        {value}
      </Text>
      {footnote && <Text className="mt-1 text-muted-foreground text-xs">{footnote}</Text>}
    </View>
  );
}

function AccountRowView({
  account,
  converted,
  baseCurrency,
  onPress,
  last,
}: {
  account: AccountRow;
  converted: number | null;
  baseCurrency: string;
  onPress: () => void;
  last: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-14 flex-row items-center gap-3 px-4 py-2.5 active:bg-muted ${last ? "" : "border-border border-b"}`}
    >
      <View className="size-3 rounded-full" style={{ backgroundColor: account.labelColor }} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-medium text-base text-foreground">
          {account.labelText || "Untitled"}
        </Text>
        {account.description || account.excludeFromDashboard ? (
          <Text numberOfLines={1} className="text-muted-foreground text-xs">
            {[account.excludeFromDashboard ? "Hidden from totals" : "", account.description]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text className="font-medium text-base text-foreground">
          {formatBalance(account.balance, account.currency)}
        </Text>
        {converted !== null && (
          <Text className="text-muted-foreground text-xs">≈ {formatBalance(converted, baseCurrency)}</Text>
        )}
      </View>
    </Pressable>
  );
}
