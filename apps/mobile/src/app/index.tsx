import { getWeekDays, toDateKey } from "@productivity/core/agenda";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
const headingFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const todayKey = toDateKey(today);

  return (
    <View className="flex-1 bg-background px-5" style={{ paddingTop: insets.top + 16 }}>
      <Text className="font-semibold text-3xl text-foreground">Today</Text>
      <Text className="mt-1 text-muted-foreground">{headingFormat.format(today)}</Text>

      <View className="mt-6 flex-row justify-between">
        {getWeekDays(today).map((day) => {
          const isToday = toDateKey(day) === todayKey;
          return (
            <View
              key={day.toISOString()}
              className={isToday ? "w-11 items-center rounded-lg bg-primary py-2" : "w-11 items-center py-2"}
            >
              <Text className={isToday ? "text-primary-foreground text-xs" : "text-muted-foreground text-xs"}>
                {weekdayFormat.format(day)}
              </Text>
              <Text className={isToday ? "font-semibold text-primary-foreground" : "text-foreground"}>
                {day.getDate()}
              </Text>
            </View>
          );
        })}
      </View>

      <View className="mt-8 rounded-lg border border-border bg-card p-4">
        <Text className="font-medium text-card-foreground">Sync isn't available on mobile yet</Text>
        <Text className="mt-1 text-muted-foreground text-sm">
          Notes, tasks, and finances will show up here once sqlite-sync supports React Native.
        </Text>
      </View>
    </View>
  );
}
