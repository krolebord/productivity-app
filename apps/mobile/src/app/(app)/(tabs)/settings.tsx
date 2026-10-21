import { useDb, useDbState } from "@productivity/core/user-db/db-context";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Button } from "../../../components/button";
import { FormRow, FormSection, FormValue } from "../../../components/form";
import { ScreenHeader } from "../../../components/screen-header";
import { SyncDot } from "../../../components/sync-status";
import { API_URL } from "../../../lib/config";
import { useSession } from "../../../lib/session";

const REMOTE_STATE_LABEL = { online: "Connected", connecting: "Connecting…", offline: "Offline" } as const;

export default function SettingsScreen() {
  const db = useDb();
  const { remoteState, deSynced } = useDbState();
  const { state, signOut } = useSession();
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
      <ScreenHeader title="Settings" />
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pt-1 pb-10">
        {state.status === "signed-in" && (
          <FormSection title="Account">
            <FormRow label="Name">
              <FormValue muted>{state.user.userName || "—"}</FormValue>
            </FormRow>
            <FormRow label="Email" last>
              <FormValue muted>{state.user.userEmail}</FormValue>
            </FormRow>
          </FormSection>
        )}

        <FormSection
          title="Sync"
          footer="Everything is stored on this device first and syncs in the background whenever you're online."
        >
          <FormRow label="Status">
            <SyncDot />
            <FormValue muted>{deSynced ? "Out of sync" : REMOTE_STATE_LABEL[remoteState]}</FormValue>
          </FormRow>
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
