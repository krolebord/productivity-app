import { useState } from "react";
import { FlatList, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetHeader } from "../screen-header";
import { FormRow, FormValue } from "./form";
import { Icon } from "./icon";
import { Input } from "./input";

export type SelectOption<T extends string> = { value: T; label: string; description?: string };

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

/** The option list on its own, for triggers other than a form row. */
export function SelectSheet<T extends string>({
  visible,
  title,
  value,
  options,
  allowCustom = false,
  clearLabel,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  value: string;
  options: readonly SelectOption<T>[];
  allowCustom?: boolean;
  clearLabel?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (option) => option.label.toLowerCase().includes(q) || option.description?.toLowerCase().includes(q),
      )
    : options;
  const showCustom = allowCustom && q.length > 0 && !options.some((option) => option.label.toLowerCase() === q);
  const searchable = allowCustom || options.length > SEARCH_THRESHOLD;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
      onDismiss={() => setQuery("")}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title={title} onCancel={onClose} />
        {searchable && (
          <View className="mx-4 mt-3 h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
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
        )}
        <FlatList
          data={filtered}
          keyExtractor={(option) => option.value}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            showCustom ? (
              <OptionRow label={`Use “${query.trim()}”`} selected={false} onPress={() => onSelect(query.trim())} />
            ) : clearLabel && !q ? (
              <OptionRow label={clearLabel} muted selected={value === ""} onPress={() => onSelect("")} />
            ) : undefined
          }
          renderItem={({ item }) => (
            <OptionRow
              label={item.label}
              description={item.description}
              selected={item.value === value}
              onPress={() => onSelect(item.value)}
            />
          )}
        />
      </View>
    </Modal>
  );
}

function OptionRow({
  label,
  description,
  muted = false,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
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
      <View className="flex-1">
        <Text className={`text-base ${muted ? "text-muted-foreground" : "text-foreground"}`}>{label}</Text>
        {description && <Text className="text-muted-foreground text-sm">{description}</Text>}
      </View>
      {selected && <Icon name="check" size={18} colorClassName="accent-primary" />}
    </Pressable>
  );
}
