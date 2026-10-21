import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Platform, Pressable, Text } from "react-native";
import { useUniwind } from "uniwind";

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
