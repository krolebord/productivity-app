import Feather from "@expo/vector-icons/Feather";
import { NativeTabs } from "expo-router/native-tabs";
import { Platform } from "react-native";
import { useCSSVariable } from "uniwind";

export default function TabsLayout() {
  const [primary, muted, mutedForeground, accent, accentForeground, ripple] = useCSSVariable([
    "--color-primary",
    "--color-muted",
    "--color-muted-foreground",
    "--color-accent",
    "--color-accent-foreground",
    "--color-ripple",
  ]) as (string | undefined)[];

  return (
    <NativeTabs
      tintColor={primary}
      backgroundColor={muted}
      indicatorColor={accent}
      rippleColor={ripple}
      iconColor={{ default: mutedForeground, selected: Platform.OS === "android" ? accentForeground : undefined }}
      labelStyle={{ default: { color: mutedForeground } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" src={<NativeTabs.Trigger.VectorIcon family={Feather} name="sun" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notes">
        <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="note.text"
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="file-text" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="habits">
        <NativeTabs.Trigger.Label>Habits</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="repeat" src={<NativeTabs.Trigger.VectorIcon family={Feather} name="repeat" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="finances">
        <NativeTabs.Trigger.Label>Finances</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="creditcard"
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="credit-card" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="gearshape"
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="settings" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
