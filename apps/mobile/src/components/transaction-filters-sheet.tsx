import type { ImportanceFilter, TransactionFilters } from "@productivity/core/data/transactions";
import { IMPORTANCE_LABELS, TRANSACTION_TYPE_META } from "@productivity/core/finance/appearance";
import { TIME_RANGE_PRESETS } from "@productivity/core/finance/transaction-list";
import { IMPORTANCE_TIERS, TRANSACTION_TYPES, type TransactionType } from "@productivity/core/transactions";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateTimeField } from "./date-time-field";
import { HeaderTextButton, ScreenHeader } from "./screen-header";
import { Chip } from "./ui/chip";
import { FormRow, FormSection, FormValue } from "./ui/form";
import { IconButton } from "./ui/icon-button";
import { PickerScreen } from "./ui/picker-screen";
import { ColorDot, SelectField } from "./ui/select-sheet";

const TYPE_OPTIONS = TRANSACTION_TYPES.map((type) => ({ value: type, label: TRANSACTION_TYPE_META[type].label }));
const IMPORTANCE_OPTIONS: { value: ImportanceFilter; label: string }[] = [
  ...IMPORTANCE_TIERS.map((tier) => ({ value: tier, label: IMPORTANCE_LABELS[tier] })),
  { value: "none", label: "Unclassified" },
];

/**
 * The ledger's filters on one full-screen page, the mobile stand-in for the web's "Add filter"
 * popovers. Changes apply as they're made; the list behind updates live.
 */
export function TransactionFiltersSheet({
  visible,
  filters,
  onChange,
  onClose,
  accounts,
  currencies,
  categories,
}: {
  visible: boolean;
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  onClose: () => void;
  accounts: readonly { id: string; labelText: string; labelColor: string; currency: string }[];
  currencies: readonly string[];
  categories: readonly string[];
}) {
  const insets = useSafeAreaInsets();
  const patch = (next: Partial<TransactionFilters>) => onChange({ ...filters, ...next });
  const hasFilters = Boolean(
    filters.accountId ||
      filters.currency ||
      filters.from ||
      filters.to ||
      filters.type ||
      filters.importance ||
      filters.category,
  );
  const now = new Date();
  const activePreset = TIME_RANGE_PRESETS.find((preset) => {
    const range = preset.getRange(now);
    return range.from === filters.from && range.to === filters.to;
  })?.id;

  return (
    <PickerScreen visible={visible} onClose={onClose}>
      <ScreenHeader
        title="Filters"
        onBack={onClose}
        actions={hasFilters && <HeaderTextButton label="Clear all" onPress={() => onChange({ q: filters.q })} />}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <FormSection>
          <SelectField
            label="Account"
            value={filters.accountId ?? ""}
            options={accounts.map((account) => ({
              value: account.id,
              label: account.labelText || "Untitled",
              description: account.currency,
              leading: <ColorDot color={account.labelColor} />,
            }))}
            onChange={(accountId) => patch({ accountId: accountId || undefined })}
            placeholder="All accounts"
            clearLabel="All accounts"
          />
          <SelectField
            label="Currency"
            value={filters.currency ?? ""}
            options={currencies.map((currency) => ({ value: currency, label: currency }))}
            onChange={(currency) => patch({ currency: currency || undefined })}
            placeholder="All currencies"
            clearLabel="All currencies"
          />
          <SelectField
            label="Type"
            value={filters.type ?? ""}
            options={TYPE_OPTIONS}
            onChange={(type) => patch({ type: (type || undefined) as TransactionType | undefined })}
            placeholder="All types"
            clearLabel="All types"
          />
          <SelectField
            label="Importance"
            value={filters.importance ?? ""}
            options={IMPORTANCE_OPTIONS}
            onChange={(importance) => patch({ importance: importance || undefined })}
            placeholder="All importance"
            clearLabel="All importance"
          />
          <SelectField
            label="Category"
            value={filters.category ?? ""}
            options={categories.map((category) => ({ value: category, label: category }))}
            onChange={(category) => patch({ category: category || undefined })}
            placeholder="Any category"
            clearLabel="Any category"
            allowCustom
            last
          />
        </FormSection>

        <View className="gap-2">
          <FormSection title="Time range">
            <DateBoundRow
              label="From"
              value={filters.from}
              onChange={(date) => patch({ from: date ? startOfDay(date).getTime() : undefined })}
              fallback={() => startOfDay(subDays(new Date(), 29))}
            />
            <DateBoundRow
              label="To"
              value={filters.to}
              onChange={(date) => patch({ to: date ? endOfDay(date).getTime() : undefined })}
              fallback={() => endOfDay(new Date())}
              last
            />
          </FormSection>
          <View className="flex-row flex-wrap gap-2">
            {TIME_RANGE_PRESETS.map((preset) => (
              <Chip
                key={preset.id}
                label={preset.label}
                selected={activePreset === preset.id}
                onPress={() => patch(preset.getRange(new Date()))}
              />
            ))}
            <Chip
              label="All time"
              selected={!filters.from && !filters.to}
              onPress={() => patch({ from: undefined, to: undefined })}
            />
          </View>
        </View>
      </ScrollView>
    </PickerScreen>
  );
}

/** One end of the time range: a date picker once set, "Any" with a tap to set it until then. */
function DateBoundRow({
  label,
  value,
  onChange,
  fallback,
  last,
}: {
  label: string;
  value: number | undefined;
  onChange: (date: Date | null) => void;
  fallback: () => Date;
  last?: boolean;
}) {
  if (!value) {
    return (
      <FormRow label={label} onPress={() => onChange(fallback())} last={last}>
        <FormValue muted>Any</FormValue>
      </FormRow>
    );
  }
  return (
    <FormRow label={label} last={last}>
      <DateTimeField mode="date" value={new Date(value)} onChange={onChange} />
      <IconButton
        icon="x"
        label={`Clear ${label.toLowerCase()} date`}
        onPress={() => onChange(null)}
        size={16}
        iconClassName="accent-muted-foreground"
        className="size-8"
      />
    </FormRow>
  );
}
