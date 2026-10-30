import { type AppCurrencyCode, currencyOptions } from "@productivity/core/currency/currencies";
import { useMemo } from "react";
import { SelectField, type SelectOption, SelectSheet } from "./ui/select-sheet";

/** Codes with their full names, priority currencies first, as the web's currency select lists them. */
function useCurrencySelectOptions(currencies: readonly AppCurrencyCode[]): SelectOption<AppCurrencyCode>[] {
  return useMemo(
    () =>
      currencyOptions(currencies).map(({ currency, name }) => ({
        value: currency,
        label: currency,
        description: name,
      })),
    [currencies],
  );
}

export function CurrencyField({
  label = "Currency",
  value,
  currencies,
  onChange,
  last,
}: {
  label?: string;
  value: string;
  currencies: readonly AppCurrencyCode[];
  onChange: (currency: AppCurrencyCode) => void;
  last?: boolean;
}) {
  const options = useCurrencySelectOptions(currencies);
  return (
    <SelectField
      label={label}
      value={value as AppCurrencyCode}
      options={options}
      onChange={(currency) => currency && onChange(currency)}
      last={last}
    />
  );
}

export function CurrencySheet({
  visible,
  title = "Currency",
  value,
  currencies,
  onChange,
  onClose,
}: {
  visible: boolean;
  title?: string;
  value: string;
  currencies: readonly AppCurrencyCode[];
  onChange: (currency: AppCurrencyCode) => void;
  onClose: () => void;
}) {
  const options = useCurrencySelectOptions(currencies);
  return (
    <SelectSheet
      visible={visible}
      title={title}
      value={value}
      options={options}
      onClose={onClose}
      onSelect={(currency) => {
        onClose();
        onChange(currency as AppCurrencyCode);
      }}
    />
  );
}
