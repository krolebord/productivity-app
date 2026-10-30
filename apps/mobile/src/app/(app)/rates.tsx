import { getCurrencyOptions, getRate } from "@productivity/core/currency/convert";
import { APP_CURRENCIES, type AppCurrencyCode } from "@productivity/core/currency/currencies";
import { formatBalance, formatRate } from "@productivity/core/currency/format";
import { useLatestCurrencyRate } from "@productivity/core/data/currency-rates";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CurrencyField } from "../../components/currency-field";
import { ScreenHeader } from "../../components/screen-header";
import { EmptyState } from "../../components/ui/empty-state";
import { FormRow, FormSection } from "../../components/ui/form";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { StatusNotice } from "../../components/ui/notice";
import { parseAmountInput } from "../../lib/finance";
import { useRefreshRates } from "../../lib/use-finance-refresh";
import { cn } from "../../lib/utils";

/** Converter plus the stored rate table, as the web's Finances → Rates tab. */
export default function RatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const latestRate = useLatestCurrencyRate();
  const rates = useRefreshRates();
  const pending = rates.status.state === "pending";

  const [amount, setAmount] = useState("100");
  const [fromCurrency, setFromCurrency] = useState<AppCurrencyCode>("USD");
  const [toCurrency, setToCurrency] = useState<AppCurrencyCode>("EUR");

  const currencyOptions = useMemo(() => (latestRate ? getCurrencyOptions(latestRate) : []), [latestRate]);
  const ratesForDisplay = useMemo(
    () =>
      latestRate
        ? APP_CURRENCIES.map((currency) => ({ currency, rate: getRate(latestRate, currency) })).filter(
            (entry): entry is { currency: AppCurrencyCode; rate: number } => entry.rate !== null,
          )
        : [],
    [latestRate],
  );

  const numericAmount = parseAmountInput(amount);
  const fromRate = latestRate ? getRate(latestRate, fromCurrency) : null;
  const toRate = latestRate ? getRate(latestRate, toCurrency) : null;
  const convertedAmount =
    amount.trim() !== "" && Number.isFinite(numericAmount) && fromRate !== null && toRate !== null
      ? (numericAmount / fromRate) * toRate
      : null;

  const swap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Exchange rates"
        subtitle={latestRate ? `${latestRate.date} · based on ${latestRate.baseCurrency}` : undefined}
        onBack={router.back}
        actions={
          latestRate && (
            <IconButton icon="refresh-cw" label="Refresh rates" onPress={rates.refresh} disabled={pending} />
          )
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <StatusNotice
          status={rates.status}
          pendingLabel="Refreshing exchange rates…"
          onRetry={rates.refresh}
          onDismiss={rates.reset}
        />

        {!latestRate ? (
          <EmptyState
            icon="dollar-sign"
            title="No exchange rates stored yet"
            description="Fetch rates to convert balances and totals into your display currency."
          >
            <Pressable
              accessibilityRole="button"
              onPress={rates.refresh}
              disabled={pending}
              className="mt-2 h-9 flex-row items-center gap-1.5 rounded-lg border border-border px-3 active:bg-muted disabled:opacity-50"
            >
              <Icon name="refresh-cw" size={14} colorClassName="accent-foreground" />
              <Text className="font-medium text-foreground text-sm">Refresh rates</Text>
            </Pressable>
          </EmptyState>
        ) : (
          <>
            <FormSection title="Converter">
              <FormRow label="Amount">
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  className="h-10 min-w-32 text-right"
                  accessibilityLabel="Amount"
                />
              </FormRow>
              <CurrencyField
                label="From"
                value={fromCurrency}
                currencies={currencyOptions}
                onChange={setFromCurrency}
              />
              <CurrencyField label="To" value={toCurrency} currencies={currencyOptions} onChange={setToCurrency} />
              <View className="flex-row items-center gap-3 px-4 py-3">
                <View className="flex-1">
                  <Text className="text-muted-foreground text-xs">Converted amount</Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    className={cn(
                      "mt-1 font-semibold text-2xl text-foreground tabular-nums",
                      convertedAmount === null && "text-muted-foreground",
                    )}
                  >
                    {convertedAmount === null ? "—" : formatBalance(convertedAmount, toCurrency)}
                  </Text>
                </View>
                <IconButton icon="repeat" label="Swap currencies" onPress={swap} iconClassName="accent-primary" />
              </View>
            </FormSection>

            <FormSection title={`Stored rates · per 1 ${latestRate.baseCurrency}`}>
              {ratesForDisplay.map(({ currency, rate }, index) => (
                <FormRow key={currency} label={currency} last={index === ratesForDisplay.length - 1}>
                  <Text className="text-base text-foreground tabular-nums">{formatRate(rate, 8)}</Text>
                </FormRow>
              ))}
            </FormSection>
          </>
        )}
      </ScrollView>
    </View>
  );
}
