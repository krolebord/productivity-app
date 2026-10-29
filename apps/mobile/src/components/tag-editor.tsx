import { normalizeTag } from "@productivity/core/tags";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "./ui/icon";
import { Input } from "./ui/input";

export function TagEditor({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly string[];
}) {
  const [draft, setDraft] = useState("");
  const query = normalizeTag(draft);
  const matches = suggestions.filter((tag) => !value.includes(tag) && (!query || tag.includes(query))).slice(0, 12);

  const add = (...raw: string[]) => {
    setDraft("");
    const next = [...value];
    for (const tag of raw.map(normalizeTag)) {
      if (tag && !next.includes(tag)) next.push(tag);
    }
    if (next.length > value.length) onChange(next);
  };

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        {value.map((tag) => (
          <Pressable
            key={tag}
            accessibilityRole="button"
            accessibilityLabel={`Remove tag ${tag}`}
            onPress={() => onChange(value.filter((t) => t !== tag))}
            className="h-7 flex-row items-center gap-1 rounded-full bg-accent pr-2 pl-3 active:opacity-70"
          >
            <Text className="text-accent-foreground text-sm">#{tag}</Text>
            <Icon name="x" size={12} colorClassName="accent-accent-foreground" />
          </Pressable>
        ))}
        <Input
          value={draft}
          // Commas separate tags; spaces stay so "side project" becomes "side-project", as on web.
          onChangeText={(text) => {
            if (!text.includes(",")) return setDraft(text);
            const parts = text.split(",");
            const rest = parts.pop() ?? "";
            add(...parts);
            setDraft(rest);
          }}
          onSubmitEditing={() => add(draft)}
          // Spaces no longer commit a tag, so keep a typed one when the field loses focus.
          onBlur={() => add(draft)}
          submitBehavior="submit"
          placeholder={value.length ? "Add tag" : "Add tags"}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          className="h-8 min-w-24 flex-1"
        />
      </View>
      {matches.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="flex-row gap-2">
            {matches.map((tag) => (
              <Pressable
                key={tag}
                accessibilityRole="button"
                onPress={() => add(tag)}
                className="h-7 justify-center rounded-full border border-border px-3 active:bg-muted"
              >
                <Text className="text-muted-foreground text-sm">#{tag}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
