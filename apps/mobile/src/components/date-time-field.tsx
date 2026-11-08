import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Platform, Pressable, Text, View } from "react-native";
import { useUniwind } from "uniwind";
import { SheetHeader } from "./screen-header";
import { FormRow } from "./ui/form";
import { FormSheet } from "./ui/form-sheet";

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
 * The date and time pickers in a form sheet, for a compact trigger such as the transaction
 * editor's date chip. Changing either keeps the other part of `value`.
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
  return (
    <FormSheet isOpen={visible} onNativeDismiss={onClose}>
      <View>
        <SheetHeader title={title} onDone={onClose} />
        <View className="p-4">
          <View className="overflow-hidden rounded-xl bg-card">
            <FormRow label="Date">
              <DateTimeField mode="date" value={value} onChange={(day) => onChange(withDate(value, day))} />
            </FormRow>
            <FormRow label="Time" last>
              <DateTimeField mode="time" value={value} onChange={(time) => onChange(withTime(value, time))} />
            </FormRow>
          </View>
        </View>
      </View>
    </FormSheet>
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
