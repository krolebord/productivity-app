import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUniwind } from "uniwind";
import { FormRow } from "./ui/form";

type PickerMode = "date" | "time";

const DISPLAY_FORMAT: Record<PickerMode, string> = { date: "EEE, MMM d, yyyy", time: "HH:mm" };

/** A date or time value: an inline compact picker on iOS, a button opening the system dialog on Android. */
export function DateTimeField({
  mode,
  value,
  onChange,
}: {
  mode: PickerMode;
  value: Date;
  onChange: (value: Date) => void;
}) {
  const { theme } = useUniwind();

  if (Platform.OS === "ios") {
    return (
      <DateTimePicker
        mode={mode}
        display="compact"
        value={value}
        themeVariant={theme === "dark" ? "dark" : "light"}
        onValueChange={(_, date) => onChange(date)}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        DateTimePickerAndroid.open({ mode, value, is24Hour: true, onValueChange: (_, date) => onChange(date) })
      }
      className="h-9 justify-center rounded-md bg-muted px-3 active:opacity-70"
    >
      <Text className="text-base text-foreground">{format(value, DISPLAY_FORMAT[mode])}</Text>
    </Pressable>
  );
}

/**
 * The date and time pickers in a panel sliding up from the bottom, for a compact trigger such as
 * the transaction editor's date chip. Changing either keeps the other part of `value`.
 */
export function DateTimeSheet({
  visible,
  title = "Date and time",
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title?: string;
  value: Date;
  onChange: (value: Date) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* A sibling of the panel, not its parent, so VoiceOver can still reach the pickers. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View className="gap-2 px-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="overflow-hidden rounded-2xl bg-card">
            <Text className="border-border border-b px-4 py-3 text-center text-muted-foreground text-xs uppercase tracking-wide">
              {title}
            </Text>
            <FormRow label="Date">
              <DateTimeField mode="date" value={value} onChange={(day) => onChange(withDate(value, day))} />
            </FormRow>
            <FormRow label="Time" last>
              <DateTimeField mode="time" value={value} onChange={(time) => onChange(withTime(value, time))} />
            </FormRow>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="min-h-14 items-center justify-center rounded-2xl bg-card active:bg-muted"
          >
            <Text className="font-semibold text-base text-primary">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
