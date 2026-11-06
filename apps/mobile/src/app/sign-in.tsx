import { ORPCError, safe } from "@orpc/client";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { AuthScreen } from "../components/auth-screen";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/text-field";
import { api } from "../lib/api";
import { signInWithGoogle } from "../lib/google-sign-in";
import { useSession } from "../lib/session";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
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

  async function continueWithGoogle() {
    if (googlePending) return;

    setGooglePending(true);
    setError(null);
    const result = await signInWithGoogle();

    if (result.type === "success") {
      await signIn(result.token, result.user);
      return;
    }
    setGooglePending(false);
    if (result.type === "error") setError(result.message);
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
      <Button label="Continue" onPress={submit} loading={pending} disabled={!email.trim() || googlePending} />
      <View className="my-1 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <Text className="text-muted-foreground text-sm">or</Text>
        <View className="h-px flex-1 bg-border" />
      </View>
      <Button
        label="Continue with Google"
        variant="outline"
        onPress={continueWithGoogle}
        loading={googlePending}
        disabled={pending}
      />
    </AuthScreen>
  );
}
