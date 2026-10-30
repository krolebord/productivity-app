import { useDashboardSettings } from "@productivity/core/data/dashboard-settings";
import { timeZoneMismatch } from "@productivity/core/time-zone";
import { useDb } from "@productivity/core/user-db/db-context";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { ScreenHeader } from "../../components/screen-header";
import { SyncStatus } from "../../components/sync-status";
import { useDeviceTimeZone } from "../../components/time-zone-watcher";
import { Button } from "../../components/ui/button";
import { FormRow, FormSection, FormValue } from "../../components/ui/form";
import { Segmented } from "../../components/ui/segmented";
import { API_URL } from "../../lib/config";
import { type DefaultHome, setPreference, type ThemePreference, usePreference } from "../../lib/preferences";
import { useSession } from "../../lib/session";

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemePreference; label: string }[];

const HOME_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "finances", label: "Finances" },
] as const satisfies readonly { value: DefaultHome; label: string }[];

export default function SettingsScreen() {
  const router = useRouter();
  const db = useDb();
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const theme = usePreference("theme");
  const defaultHome = usePreference("defaultHome");
  const { timeZone, setTimeZone } = useDashboardSettings();
  const deviceTimeZone = useDeviceTimeZone();
  const mismatch = timeZoneMismatch(timeZone, deviceTimeZone);

  const handleSignOut = async () => {
    setSigningOut(true);
    if (await signOut()) return;
    setSigningOut(false);
    // Signing out can't wait for a connection the way edits do, so let the user choose. The synced
    // data stays on the device either way, unsynced changes included, until they sign back in.
    Alert.alert(
      "Couldn't reach the server",
      "Sign out on this device anyway? The session stays valid on the server until it expires.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out anyway", style: "destructive", onPress: () => void signOut({ localOnly: true }) },
      ],
    );
  };

  const confirmReset = () =>
    Alert.alert(
      "Reset local data?",
      "Deletes the copy on this device and downloads it again. Changes that haven't synced yet are lost.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => void db.requestReload({ clean: true }) },
      ],
    );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Settings" onBack={router.back} />
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pt-1 pb-10">
        <FormSection title="Appearance">
          <View className="px-3 py-3">
            <Segmented options={THEME_OPTIONS} value={theme} onChange={(value) => setPreference("theme", value)} />
          </View>
        </FormSection>

        <FormSection title="Default home" footer="The tab the app opens on. Applies from the next launch.">
          <View className="px-3 py-3">
            <Segmented
              options={HOME_OPTIONS}
              value={defaultHome}
              onChange={(value) => setPreference("defaultHome", value)}
            />
          </View>
        </FormSection>

        <FormSection
          title="Timezone"
          footer="Saved for your account: calendar sync and connected agents use it to tell what “today” is."
        >
          <FormRow label="Saved">
            <FormValue muted={!timeZone}>{timeZone || "Not set yet"}</FormValue>
          </FormRow>
          <FormRow label="This device" last={!mismatch}>
            <FormValue muted>{deviceTimeZone}</FormValue>
          </FormRow>
          {mismatch && <FormRow label="Use this device's timezone" onPress={() => setTimeZone(mismatch.device)} last />}
        </FormSection>

        <FormSection
          title="Sync"
          footer="Everything is stored on this device first and syncs in the background whenever you're online."
        >
          <FormRow label="Status">
            <SyncStatus />
          </FormRow>
          <FormRow label="Server">
            <FormValue muted>{API_URL.replace(/^https?:\/\//, "")}</FormValue>
          </FormRow>
          <FormRow label="Sync now" onPress={() => db.state.sync()} />
          <FormRow label="Reset local data" onPress={confirmReset} last />
        </FormSection>

        <View className="gap-2">
          <Button label="Sign out" variant="ghost" loading={signingOut} onPress={() => void handleSignOut()} />
          <Text className="text-center text-muted-foreground text-xs">Your data stays on this device.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
