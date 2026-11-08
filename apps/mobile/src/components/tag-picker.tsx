import { useNoteTagSuggestions } from "@productivity/core/data/notes";
import { useTaskTagSuggestions } from "@productivity/core/data/tasks";
import { normalizeTag } from "@productivity/core/tags";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "./screen-header";
import { CheckboxIndicator } from "./ui/checkbox";
import { Icon } from "./ui/icon";
import { Input } from "./ui/input";
import { PickerScreen } from "./ui/picker-screen";

type Row = { kind: "create"; tag: string } | { kind: "tag"; tag: string };

type TagsSheetProps = {
  open: boolean;
  value: readonly string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
};

/**
 * The tag picker, a full-screen page over the task or note editor. It reads the editor's tags and
 * loads the suggestions for that kind of item, so both stay current while it's open.
 */
export function ItemTagsSheet({ kind, ...props }: TagsSheetProps & { kind: "task" | "note" }) {
  return (
    <PickerScreen visible={props.open} onClose={props.onClose}>
      {kind === "task" ? <TaskTagPicker {...props} /> : <NoteTagPicker {...props} />}
    </PickerScreen>
  );
}

function TaskTagPicker(props: TagsSheetProps) {
  return <TagPicker {...props} suggestions={useTaskTagSuggestions() ?? []} />;
}

function NoteTagPicker(props: TagsSheetProps) {
  return <TagPicker {...props} suggestions={useNoteTagSuggestions() ?? []} />;
}

/**
 * Every known tag with a checkbox, a field on top that filters them, and a "Create" row when the
 * typed name is new. Changes apply as they're made.
 */
function TagPicker({
  value,
  onChange,
  suggestions,
  onClose,
}: {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly string[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const query = normalizeTag(draft);
  // The item's own tags may not be saved yet, so they aren't always among the suggestions.
  const all = Array.from(new Set([...suggestions, ...value])).sort();
  const rows: Row[] = [
    ...(query && !all.includes(query) ? [{ kind: "create" as const, tag: query }] : []),
    ...all.filter((tag) => !query || tag.includes(query)).map((tag) => ({ kind: "tag" as const, tag })),
  ];

  const toggle = (tag: string) => onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  const create = (tag: string) => {
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };
  const submit = () => {
    if (!query) return;
    if (all.includes(query)) {
      if (!value.includes(query)) toggle(query);
      setDraft("");
    } else create(query);
  };

  return (
    <>
      <ScreenHeader title="Tags" onBack={onClose}>
        <View className="h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
          <Icon name="tag" size={16} colorClassName="accent-muted-foreground" />
          <Input
            accessibilityLabel="Tag name"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            submitBehavior="submit"
            returnKeyType="done"
            placeholder="Find or create a tag"
            autoCapitalize="none"
            autoCorrect={false}
            className="h-full flex-1"
          />
        </View>
      </ScreenHeader>
      <FlatList
        data={rows}
        keyExtractor={(row) => `${row.kind}:${row.tag}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
        renderItem={({ item: row }) =>
          row.kind === "create" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => create(row.tag)}
              className="min-h-14 flex-row items-center gap-5 px-5 active:bg-muted"
            >
              <Icon name="plus" size={22} colorClassName="accent-primary" />
              <Text className="flex-1 text-base text-foreground">Create “{row.tag}”</Text>
            </Pressable>
          ) : (
            <TagRow tag={row.tag} checked={value.includes(row.tag)} onPress={() => toggle(row.tag)} />
          )
        }
      />
    </>
  );
}

function TagRow({ tag, checked, onPress }: { tag: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={tag}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-5 px-5 active:bg-muted"
    >
      <Icon name="tag" size={20} colorClassName="accent-muted-foreground" />
      <Text className="flex-1 text-base text-foreground">{tag}</Text>
      <CheckboxIndicator checked={checked} />
    </Pressable>
  );
}
