import { ORPCError, safe } from "@orpc/client";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { AuthScreen } from "../components/auth-screen";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/text-field";
import { api } from "../lib/api";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);
    const result = await safe(api.auth.mobile.requestCode({ email: trimmed }));
    setPending(false);

    if (result.error) {
      setError(
        result.error instanceof ORPCError && result.error.code === "BAD_REQUEST"
          ? "Enter a valid email address."
          : "Couldn't send the code. Check your connection and try again.",
      );
      return;
    }
    router.push({ pathname: "/verify", params: { email: trimmed } });
  }

  return (
    <AuthScreen title="Sign in" description="We'll email you a 6-digit code.">
      <TextField
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
        autoFocus
      />
      {error && <Text className="text-destructive text-sm">{error}</Text>}
      <Button label="Continue" onPress={submit} loading={pending} disabled={!email.trim()} />
    </AuthScreen>
  );
}
