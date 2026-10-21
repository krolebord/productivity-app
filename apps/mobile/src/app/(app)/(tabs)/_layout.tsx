import Feather from "@expo/vector-icons/Feather";
import { NativeTabs, type SFSymbolIcon } from "expo-router/native-tabs";
import { useCSSVariable } from "uniwind";

type TabIconProps = { sf: SFSymbolIcon["sf"]; feather: keyof typeof Feather.glyphMap };

function TabIcon({ sf, feather }: TabIconProps) {
  return <NativeTabs.Trigger.Icon sf={sf} src={<NativeTabs.Trigger.VectorIcon family={Feather} name={feather} />} />;
}

export default function TabsLayout() {
  const primary = useCSSVariable("--color-primary") as string | undefined;

  return (
    <NativeTabs tintColor={primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <TabIcon sf="sun.max" feather="sun" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notes">
        <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
        <TabIcon sf="note.text" feather="file-text" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="habits">
        <NativeTabs.Trigger.Label>Habits</NativeTabs.Trigger.Label>
        <TabIcon sf="repeat" feather="repeat" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="finances">
        <NativeTabs.Trigger.Label>Finances</NativeTabs.Trigger.Label>
        <TabIcon sf="creditcard" feather="credit-card" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <TabIcon sf="gearshape" feather="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
