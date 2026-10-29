import { type AgendaHabit, habitTargetPeriodLabel } from "@productivity/core/agenda";
import { Alert } from "react-native";

/**
 * Unchecking a counter habit zeroes its count (for weekly/monthly habits, every day of
 * the period), so it asks first; a simple habit is a single tap to redo.
 */
export function confirmHabitReset(habit: AgendaHabit, progress: number, reset: () => void) {
  if (habit.target <= 1) {
    reset();
    return;
  }
  const unit = habit.unit.trim();
  const period = habitTargetPeriodLabel(habit.scheduleType);
  Alert.alert(
    `Reset ${habit.name}?`,
    `This clears ${progress}/${habit.target}${unit ? ` ${unit}` : ""} logged ${period === "day" ? "that day" : `that ${period}`}.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: reset },
    ],
  );
}
