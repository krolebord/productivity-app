import {
  createMemory,
  deleteMemory,
  type MemoryRow,
  setMemoryEnabled,
  updateMemoryContent,
  useMemories,
} from "@productivity/core/data/memories";
import { useDb } from "@productivity/core/user-db/db-context";
import { MEMORY_INJECTION_LIMIT } from "@productivity/core/user-db/migrations";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/screen-header";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";

function SourceBadge({ source }: { source: string }) {
  return (
    <View className="rounded-full bg-muted px-2 py-0.5">
      <Text className="font-medium text-muted-foreground text-xs">{source === "assistant" ? "Assistant" : "You"}</Text>
    </View>
  );
}

function MemoryCard({ memory }: { memory: MemoryRow }) {
  const db = useDb();
  const [draft, setDraft] = useState(() => memory.content);
  // The synced text the draft started from: while it's untouched it follows edits made
  // elsewhere (another device, the assistant), and only a real local edit is saved.
  const [base, setBase] = useState(() => memory.content);
  if (memory.content !== base) {
    setBase(memory.content);
    if (draft === base) setDraft(memory.content);
  }

  const saveContent = () => {
    const trimmed = draft.trim();
    if (!trimmed || draft === base || trimmed === memory.content) {
      setDraft(memory.content);
      return;
    }
    updateMemoryContent(db.db, memory.id, trimmed);
    setBase(trimmed);
    setDraft(trimmed);
  };

  const remove = () =>
    Alert.alert("Delete memory?", "The assistant will no longer remember this.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMemory(db.db, memory.id) },
    ]);

  return (
    <View className={cn("rounded-xl border border-border bg-card px-4 py-3", !memory.enabled && "opacity-60")}>
      <Input
        value={draft}
        onChangeText={setDraft}
        onBlur={saveContent}
        multiline
        placeholder="Memory content…"
        accessibilityLabel="Memory"
      />
      <View className="mt-2 flex-row items-center gap-2 border-border border-t pt-2">
        <SourceBadge source={memory.source} />
        <View className="ml-auto flex-row items-center gap-2">
          <Text className="text-muted-foreground text-xs">Enabled</Text>
          <Switch
            accessibilityLabel="Enabled"
            // SQLite hands booleans back as 0/1, and the native switch only reads a real boolean.
            value={Boolean(memory.enabled)}
            onValueChange={(enabled) => setMemoryEnabled(db.db, memory.id, enabled)}
            trackColorOnClassName="accent-primary"
          />
          <IconButton
            icon="trash-2"
            label="Delete memory"
            onPress={remove}
            size={16}
            iconClassName="accent-muted-foreground"
          />
        </View>
      </View>
    </View>
  );
}

export default function MemoriesScreen() {
  const router = useRouter();
  const db = useDb();
  const insets = useSafeAreaInsets();
  const memories = useMemories();
  const [draft, setDraft] = useState("");
  const enabledCount = memories.filter((memory) => memory.enabled).length;

  const addMemory = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    createMemory(db.db, trimmed);
    setDraft("");
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Memories"
        subtitle="Durable notes the assistant keeps about you. Every enabled memory is shared with it in each chat."
        onBack={router.back}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View className="gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <Input
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Add something the assistant should remember…"
            className="min-h-12"
          />
          <Button label="Add memory" onPress={addMemory} disabled={!draft.trim()} />
        </View>

        {enabledCount > MEMORY_INJECTION_LIMIT && (
          <View className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <Text className="text-amber-700 text-xs dark:text-amber-400">
              You have {enabledCount} enabled memories. Only the newest {MEMORY_INJECTION_LIMIT} are shared with the
              assistant — disable or delete some to stay under the limit.
            </Text>
          </View>
        )}

        {memories.length === 0 ? (
          <EmptyState
            icon="bookmark"
            title="No memories yet"
            description="Add one above, or just tell the assistant something worth remembering."
          />
        ) : (
          memories.map((memory) => <MemoryCard key={memory.id} memory={memory} />)
        )}
      </ScrollView>
    </View>
  );
}
