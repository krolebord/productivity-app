import { useDb } from "@productivity/core/user-db/db-context";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { ScreenHeader } from "../../components/screen-header";
import { Button } from "../../components/ui/button";
import { FormRow, FormSection, FormValue } from "../../components/ui/form";
import { API_URL } from "../../lib/config";
import { useSession } from "../../lib/session";

export default function SettingsScreen() {
  const router = useRouter();
  const db = useDb();
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);

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
        <FormSection
          title="Sync"
          footer="Everything is stored on this device first and syncs in the background whenever you're online."
        >
          <FormRow label="Server">
            <FormValue muted>{API_URL.replace(/^https?:\/\//, "")}</FormValue>
          </FormRow>
          <FormRow label="Sync now" onPress={() => db.state.sync()} />
          <FormRow label="Reset local data" onPress={confirmReset} last />
        </FormSection>

        <View className="gap-2">
          <Button
            label="Sign out"
            variant="ghost"
            loading={signingOut}
            onPress={() => {
              setSigningOut(true);
              void signOut();
            }}
          />
          <Text className="text-center text-muted-foreground text-xs">Your data stays on this device.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
