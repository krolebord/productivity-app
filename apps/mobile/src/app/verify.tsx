import { safe } from "@orpc/client";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { AuthScreen } from "../components/auth-screen";
import { Button } from "../components/button";
import { TextField } from "../components/text-field";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const router = useRouter();
  const { signIn } = useSession();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  if (!email) {
    return <Redirect href="/sign-in" />;
  }

  async function submit(value: string) {
    if (!email || value.length !== CODE_LENGTH || pending) return;

    setPending(true);
    setMessage(null);
    const { error, data } = await safe(api.auth.mobile.verifyCode({ email, code: value }));

    if (error) {
      setPending(false);
      setMessage({ tone: "error", text: "Couldn't verify the code. Check your connection and try again." });
      return;
    }
    if (!data.success) {
      setPending(false);
      setCode("");
      setMessage({ tone: "error", text: data.error });
      return;
    }
    await signIn(data.token, data.user);
  }

  function onChangeCode(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) submit(digits);
  }

  async function resend() {
    if (!email) return;
    setResending(true);
    setMessage(null);
    const { error } = await safe(api.auth.mobile.requestCode({ email }));
    setResending(false);
    setCode("");
    setMessage(
      error
        ? { tone: "error", text: "Couldn't send a new code. Try again." }
        : { tone: "info", text: "We sent you a new code." },
    );
  }

  return (
    <AuthScreen title="Check your email" description={`Enter the 6-digit code we sent to ${email}.`}>
      <TextField
        value={code}
        onChangeText={onChangeCode}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        className="text-center font-semibold text-2xl tracking-[8px]"
        editable={!pending}
        autoFocus
      />
      {message && (
        <Text className={message.tone === "error" ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
          {message.text}
        </Text>
      )}
      <Button label="Verify" onPress={() => submit(code)} loading={pending} disabled={code.length !== CODE_LENGTH} />
      <Button label="Send a new code" variant="ghost" onPress={resend} loading={resending} />
      <Button label="Use a different email" variant="ghost" onPress={() => router.back()} />
    </AuthScreen>
  );
}
