import { safe } from "@orpc/client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Pressable, Text } from "react-native";
import { SheetHeader } from "../../components/screen-header";
import { FieldError, FormSection } from "../../components/ui/form";
import { Icon } from "../../components/ui/icon";
import { Input } from "../../components/ui/input";
import { KeyboardScreen } from "../../components/ui/keyboard-screen";
import { api } from "../../lib/api";

const MIN_TOKEN_LENGTH = 20;

/** Paste a personal Monobank token to connect, or to replace the stored one, as the web's dialog. */
export default function MonobankTokenScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const replacing = mode === "replace";
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The keyboard's submit still fires while the header button is disabled, so guard synchronously.
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    const trimmed = token.trim();
    if (trimmed.length < MIN_TOKEN_LENGTH) {
      setError("That does not look like a valid Monobank token.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    const procedure = replacing ? api.integrations.monobank.replaceToken : api.integrations.monobank.connect;
    const result = await safe(procedure({ token: trimmed }));
    inFlight.current = false;
    setPending(false);
    if (result.error) {
      setError(result.error.message || "Something went wrong. Try again.");
      return;
    }
    router.back();
  }

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title={replacing ? "Replace token" : "Connect Monobank"}
          onCancel={() => router.back()}
          onDone={() => void submit()}
          doneLabel={pending ? "Checking…" : replacing ? "Replace" : "Connect"}
          doneDisabled={pending}
        />
      }
    >
      <Text className="px-1 text-muted-foreground text-sm">
        Create a personal Monobank API token, paste it here, and we will use it to receive new transaction webhooks. The
        token is stored on the server.
      </Text>
      <FormSection title="Personal token">
        <Input
          value={token}
          onChangeText={(value) => {
            setToken(value);
            setError(null);
          }}
          placeholder="Paste your Monobank token"
          className="h-12 px-4"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
      </FormSection>
      <FieldError message={error} />
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL("https://api.monobank.ua/")}
        className="flex-row items-center gap-1.5 self-start px-1 active:opacity-60"
      >
        <Icon name="external-link" size={14} colorClassName="accent-muted-foreground" />
        <Text className="text-muted-foreground text-sm">Get token</Text>
      </Pressable>
    </KeyboardScreen>
  );
}
