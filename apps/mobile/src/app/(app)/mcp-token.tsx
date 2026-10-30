import { safe } from "@orpc/client";
import type { McpTokenAccess } from "@productivity/core/api/contract";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SheetHeader } from "../../components/screen-header";
import { FieldError, FormOption, FormRow, FormSection } from "../../components/ui/form";
import { Icon } from "../../components/ui/icon";
import { Input } from "../../components/ui/input";
import { KeyboardScreen } from "../../components/ui/keyboard-screen";
import { api } from "../../lib/api";
import { API_URL } from "../../lib/config";

// Uniwind's font-mono has no native family behind it, so the token's face is picked per platform.
const MONOSPACE = { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) };

const ACCESS_OPTIONS = [
  { value: "read", label: "Read only" },
  { value: "read-write", label: "Read and write" },
] as const satisfies readonly { value: McpTokenAccess; label: string }[];

/** Create an MCP personal access token, then show it once to copy, as the web's dialog. */
export default function McpTokenScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [access, setAccess] = useState<McpTokenAccess>("read");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // The keyboard's submit still fires while the header button is disabled, so guard synchronously.
  const inFlight = useRef(false);

  async function create() {
    if (inFlight.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the token a name.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    const result = await safe(api.mcp.createToken({ name: trimmed, access }));
    inFlight.current = false;
    setPending(false);
    if (result.error) {
      setError("Could not create the token. Try again.");
      return;
    }
    setToken(result.data.token);
  }

  if (token) {
    const url = `${API_URL}/mcp`;
    return (
      <KeyboardScreen header={<SheetHeader title="Token created" onDone={() => router.back()} />}>
        <Text className="px-1 text-muted-foreground text-sm">Copy it now. It will not be shown again.</Text>
        <CopyableBlock label="Token" value={token} />
        <CopyableBlock
          label="Claude Code"
          value={`claude mcp add --transport http productivity ${url} --header "Authorization: Bearer ${token}"`}
        />
      </KeyboardScreen>
    );
  }

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title="New MCP token"
          onCancel={() => router.back()}
          onDone={() => void create()}
          doneLabel={pending ? "Creating…" : "Create"}
          doneDisabled={pending}
        />
      }
    >
      <Text className="px-1 text-muted-foreground text-sm">
        Lets an external agent read your notes, accounts, and transactions. Read-write tokens can also change them.
      </Text>
      <FormSection>
        <FormRow label="Name" last>
          <Input
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError(null);
            }}
            placeholder="e.g. Claude Code on laptop"
            className="h-10 min-w-48 text-right"
            autoCorrect={false}
            maxLength={80}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void create()}
          />
        </FormRow>
      </FormSection>
      <FieldError message={error} />
      <FormSection title="Access">
        {ACCESS_OPTIONS.map((option, index) => (
          <FormOption
            key={option.value}
            label={option.label}
            selected={access === option.value}
            onPress={() => setAccess(option.value)}
            last={index === ACCESS_OPTIONS.length - 1}
          />
        ))}
      </FormSection>
    </KeyboardScreen>
  );
}

function CopyableBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // Keeps the token out of Android's clipboard preview and keyboard suggestions.
    await Clipboard.setStringAsync(value, { android: { isSensitive: true } });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy ${label}`}
          onPress={() => void copy()}
          hitSlop={8}
          className="flex-row items-center gap-1.5 active:opacity-60"
        >
          <Icon name={copied ? "check" : "copy"} size={14} colorClassName="accent-primary" />
          <Text className="font-medium text-primary text-sm">{copied ? "Copied" : "Copy"}</Text>
        </Pressable>
      </View>
      <Text
        selectable
        className="rounded-xl border border-border bg-muted px-4 py-3 text-foreground text-sm"
        style={MONOSPACE}
      >
        {value}
      </Text>
    </View>
  );
}
