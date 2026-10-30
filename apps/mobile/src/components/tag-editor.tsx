import { addTags, normalizeTag } from "@productivity/core/tags";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "./ui/icon";
import { Input } from "./ui/input";

export type TagEditorHandle = {
  /** Adds the typed, not yet committed tag text, e.g. before the editor's data moves elsewhere. */
  commit: () => void;
};

export function TagEditor({
  ref,
  value,
  onChange,
  suggestions,
}: {
  ref?: Ref<TagEditorHandle>;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly string[];
}) {
  const [draft, setDraft] = useState("");
  const query = normalizeTag(draft);
  const matches = suggestions.filter((tag) => !value.includes(tag) && (!query || tag.includes(query))).slice(0, 12);

  const add = (raw: string) => {
    setDraft("");
    const next = addTags(value, raw);
    if (next.length > value.length) onChange(next);
  };

  useImperativeHandle(ref, () => ({ commit: () => add(draft) }));

  // Closing the screen doesn't reliably blur the field first, so keep a typed tag on unmount too
  // (useAutosave saves changes scheduled after unmount right away).
  const latest = useRef({ draft, value, onChange });
  latest.current = { draft, value, onChange };
  useEffect(
    () => () => {
      const { draft, value, onChange } = latest.current;
      const next = addTags(value, draft);
      if (next.length > value.length) onChange(next);
    },
    [],
  );

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
            const rest = text.slice(text.lastIndexOf(",") + 1);
            add(text.slice(0, text.lastIndexOf(",")));
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
          // py-0: Android's default input padding doesn't fit an h-8 field and clips the text.
          className="h-8 min-w-24 flex-1 py-0"
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
