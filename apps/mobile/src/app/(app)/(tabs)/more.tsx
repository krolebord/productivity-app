import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useTabContentInset } from "../../../components/assistant-button";
import { ScreenHeader } from "../../../components/screen-header";
import { SyncStatus } from "../../../components/sync-status";
import { FormRow, FormSection } from "../../../components/ui/form";
import { useSession } from "../../../lib/session";

export default function MoreScreen() {
  const contentInset = useTabContentInset();
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="More" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: contentInset }}
      >
        <AccountCard />
        <FormSection>
          <FormRow icon="repeat" label="Habits" onPress={() => router.push("/habits")} />
          <FormRow icon="settings" label="Settings" onPress={() => router.push("/settings")} last />
        </FormSection>
      </ScrollView>
    </View>
  );
}

/** Who's signed in and whether the device is syncing. */
function AccountCard() {
  const { state } = useSession();
  if (state.status !== "signed-in") return null;
  const { userName, userEmail } = state.user;
  const name = userName.trim();

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <View className="size-10 items-center justify-center rounded-full bg-muted">
        <Text className="font-semibold text-base text-muted-foreground">
          {(name || userEmail).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-medium text-base text-foreground">
          {name || userEmail}
        </Text>
        {name ? (
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {userEmail}
          </Text>
        ) : null}
      </View>
      <SyncStatus />
    </View>
  );
}
