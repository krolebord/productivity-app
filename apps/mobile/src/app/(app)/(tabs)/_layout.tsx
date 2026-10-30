import Feather from "@expo/vector-icons/Feather";
import { usePathname, useRouter } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { AssistantButton, useAssistantEnabled } from "../../../components/assistant-button";
import { getPreferences } from "../../../lib/preferences";

/**
 * Opens the default home tab once the tabs mount, like the web's redirect from "/". The tab order
 * is fixed by the triggers, so it switches tabs rather than changing the initial route; a launch
 * that deep-linked somewhere else is left alone.
 */
function useOpenDefaultHome() {
  const router = useRouter();
  const pathname = usePathname();
  const initialPath = useRef(pathname).current;
  useEffect(() => {
    if (initialPath === "/" && getPreferences().defaultHome === "finances") router.navigate("/finances");
  }, [initialPath, router]);
}

export default function TabsLayout() {
  const [primary, muted, mutedForeground, accent, accentForeground, ripple] = useCSSVariable([
    "--color-primary",
    "--color-muted",
    "--color-muted-foreground",
    "--color-accent",
    "--color-accent-foreground",
    "--color-ripple",
  ]) as (string | undefined)[];
  const assistantEnabled = useAssistantEnabled();
  useOpenDefaultHome();

  return (
    <View className="flex-1">
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
        <NativeTabs.Trigger name="finances">
          <NativeTabs.Trigger.Label>Finances</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf="creditcard"
            src={<NativeTabs.Trigger.VectorIcon family={Feather} name="credit-card" />}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="notes">
          <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf="note.text"
            src={<NativeTabs.Trigger.VectorIcon family={Feather} name="file-text" />}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf="ellipsis.circle"
            src={<NativeTabs.Trigger.VectorIcon family={Feather} name="more-horizontal" />}
          />
        </NativeTabs.Trigger>
      </NativeTabs>
      {assistantEnabled && <AssistantButton />}
    </View>
  );
}
