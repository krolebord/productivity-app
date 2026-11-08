import { type ReactNode, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader, SheetHeader } from "../screen-header";
import { FormRow, FormValue } from "./form";
import { FormSheet } from "./form-sheet";
import { Icon } from "./icon";
import { Input } from "./input";
import { PickerScreen } from "./picker-screen";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  /** Extra search text that isn't shown, e.g. what the accessories stand for. */
  keywords?: string;
  /** Shown after the label, e.g. icons. `label`/`description` stay plain text for search. */
  labelAccessory?: ReactNode;
  /** Shown at the end of the description line. */
  descriptionAccessory?: ReactNode;
};

const SEARCH_THRESHOLD = 10;

/** A form row that opens a searchable list of options in a sheet. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose",
  last,
  allowCustom = false,
  clearLabel,
}: {
  label: string;
  value: T | "";
  options: readonly SelectOption<T>[];
  onChange: (value: T | "") => void;
  placeholder?: string;
  last?: boolean;
  /** Lets the search text itself be picked, for free-text fields with suggestions. */
  allowCustom?: boolean;
  /** Adds a first option with this label that clears the value back to "". */
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const display = selected?.label ?? (value || null);

  return (
    <>
      <FormRow label={label} onPress={() => setOpen(true)} last={last}>
        <FormValue muted={!display}>{display ?? placeholder}</FormValue>
      </FormRow>
      <SelectSheet
        visible={open}
        title={label}
        value={value}
        options={options}
        allowCustom={allowCustom}
        clearLabel={clearLabel}
        onClose={() => setOpen(false)}
        onSelect={(next) => {
          setOpen(false);
          onChange(next as T | "");
        }}
      />
    </>
  );
}

/**
 * The option list on its own, for triggers other than a form row. Searchable lists (more than
 * SEARCH_THRESHOLD options, or `allowCustom`) open as a full-screen PickerScreen; short ones fit in
 * a FormSheet without scrolling.
 */
export function SelectSheet<T extends string>(props: SelectListProps<T> & { visible: boolean; onClose: () => void }) {
  const { visible, title, value, options, allowCustom = false, clearLabel, onClose, onSelect } = props;
  if (allowCustom || options.length > SEARCH_THRESHOLD) {
    return (
      <PickerScreen visible={visible} onClose={onClose}>
        <SearchableList {...props} />
      </PickerScreen>
    );
  }
  return (
    <FormSheet isOpen={visible} onNativeDismiss={onClose}>
      <SheetHeader title={title} onCancel={onClose} />
      {clearLabel && <OptionRow label={clearLabel} muted selected={value === ""} onPress={() => onSelect("")} />}
      {options.map((option) => (
        <Option key={option.value} option={option} value={value} onSelect={onSelect} />
      ))}
    </FormSheet>
  );
}

type SelectListProps<T extends string> = {
  title: string;
  value: string;
  options: readonly SelectOption<T>[];
  allowCustom?: boolean;
  clearLabel?: string;
  onSelect: (value: string) => void;
};

/** The full-screen list: search on top, and a "Use …" row for new values when `allowCustom`. */
function SearchableList<T extends string>({
  title,
  value,
  options,
  allowCustom = false,
  clearLabel,
  onSelect,
  onClose,
}: SelectListProps<T> & { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(q) ||
          option.description?.toLowerCase().includes(q) ||
          option.keywords?.toLowerCase().includes(q),
      )
    : options;
  const showCustom = allowCustom && q.length > 0 && !options.some((option) => option.label.toLowerCase() === q);

  return (
    <>
      <ScreenHeader title={title} onBack={onClose}>
        <View className="h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
          <Icon name="search" size={16} colorClassName="accent-muted-foreground" />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={allowCustom ? "Search or type a new one" : "Search"}
            className="h-full flex-1"
            autoCorrect={false}
            onSubmitEditing={() => showCustom && onSelect(query.trim())}
          />
        </View>
      </ScreenHeader>
      <FlatList
        data={filtered}
        keyExtractor={(option) => option.value}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          showCustom ? (
            <OptionRow label={`Use “${query.trim()}”`} selected={false} onPress={() => onSelect(query.trim())} />
          ) : clearLabel && !q ? (
            <OptionRow label={clearLabel} muted selected={value === ""} onPress={() => onSelect("")} />
          ) : undefined
        }
        renderItem={({ item }) => <Option option={item} value={value} onSelect={onSelect} />}
      />
    </>
  );
}

function Option<T extends string>({
  option,
  value,
  onSelect,
}: {
  option: SelectOption<T>;
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <OptionRow
      label={option.label}
      description={option.description}
      labelAccessory={option.labelAccessory}
      descriptionAccessory={option.descriptionAccessory}
      selected={option.value === value}
      onPress={() => onSelect(option.value)}
    />
  );
}

function OptionRow({
  label,
  description,
  labelAccessory,
  descriptionAccessory,
  muted = false,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  labelAccessory?: ReactNode;
  descriptionAccessory?: ReactNode;
  muted?: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="min-h-12 flex-row items-center border-border border-b px-5 py-2 active:bg-muted"
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className={`shrink text-base ${muted ? "text-muted-foreground" : "text-foreground"}`}>{label}</Text>
          {labelAccessory}
        </View>
        {(description || descriptionAccessory) && (
          <View className="flex-row items-center justify-between gap-2">
            {description && (
              <Text numberOfLines={1} className="shrink text-muted-foreground text-sm">
                {description}
              </Text>
            )}
            {descriptionAccessory}
          </View>
        )}
      </View>
      {selected && <Icon name="check" size={18} colorClassName="accent-primary" />}
    </Pressable>
  );
}
