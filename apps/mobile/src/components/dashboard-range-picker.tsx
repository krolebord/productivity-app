import {
  clampDashboardRangeValue,
  type DashboardRangeMode,
  ordinal,
  resolveDashboardRange,
} from "@productivity/core/dashboard-range-store";
import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
import { useState } from "react";
import { Text, View } from "react-native";
import { IconButton } from "./ui/icon-button";
import { Input } from "./ui/input";
import { Segmented } from "./ui/segmented";

const MODE_OPTIONS: readonly { value: DashboardRangeMode; label: string }[] = [
  { value: "days", label: "Last N days" },
  { value: "cycle", label: "Billing cycle" },
];

/**
 * The finance overview's period, as the web's range popover sets it: a trailing window of
 * N days or the billing cycle since a day of the month. Both are synced settings, so the
 * web follows along.
 */
export function DashboardRangePicker() {
  const { mode, days, cycleDay, setMode, setDays, setCycleDay } = useDashboardSettings();
  const value = mode === "days" ? days : cycleDay;
  const setValue = mode === "days" ? setDays : setCycleDay;
  const { spanLabel } = resolveDashboardRange({ mode, days, cycleDay }, new Date());

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base text-foreground">
            {mode === "days" ? "Number of days" : "Cycle starts on day"}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {mode === "days"
              ? "Trailing window ending today (1–31)."
              : `From the most recent ${ordinal(cycleDay)} through today.`}
          </Text>
        </View>
        <Stepper key={mode} value={value} onChange={setValue} label={mode === "days" ? "days" : "cycle day"} />
      </View>
      <Text className="text-muted-foreground text-xs">Covers {spanLabel}</Text>
    </View>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  // Typing goes through local text so clearing the field to retype doesn't snap it back to 1.
  const [text, setText] = useState<string | null>(null);

  return (
    <View className="flex-row items-center rounded-lg bg-muted">
      <IconButton
        icon="minus"
        label={`Fewer ${label}`}
        onPress={() => onChange(clampDashboardRangeValue(value - 1))}
        disabled={value <= 1}
        size={16}
      />
      <Input
        accessibilityLabel={label}
        value={text ?? String(value)}
        onChangeText={(next) => {
          setText(next);
          const parsed = Number.parseInt(next, 10);
          if (Number.isFinite(parsed)) onChange(clampDashboardRangeValue(parsed));
        }}
        onBlur={() => setText(null)}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={2}
        className="h-10 w-9 text-center font-semibold text-base"
      />
      <IconButton
        icon="plus"
        label={`More ${label}`}
        onPress={() => onChange(clampDashboardRangeValue(value + 1))}
        disabled={value >= 31}
        size={16}
      />
    </View>
  );
}
