import { createNote, useNotesList } from "@productivity/core/data/notes";
import { markdownToPlainText } from "@productivity/core/note-text";
import { parseTags, serializeTags, UNTAGGED } from "@productivity/core/tags";
import { useDb } from "@productivity/core/user-db/db-context";
import type { NoteItem } from "@productivity/core/user-db/migrations";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useTabContentInset } from "../../../components/assistant-button";
import { ScreenHeader } from "../../../components/screen-header";
import { Chip } from "../../../components/ui/chip";
import { EmptyState } from "../../../components/ui/empty-state";
import { Icon } from "../../../components/ui/icon";
import { IconButton } from "../../../components/ui/icon-button";
import { Input } from "../../../components/ui/input";

const noteTags = (note: NoteItem) => {
  const tags = parseTags(note.tags);
  return tags.length > 0 ? tags : [UNTAGGED];
};

const tagLabel = (tag: string) => (tag === UNTAGGED ? "untagged" : `#${tag}`);

export default function NotesScreen() {
  const contentInset = useTabContentInset();
  const db = useDb();
  const router = useRouter();
  const { notes } = useNotesList();
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      for (const tag of noteTags(note)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.keys()].sort((a, b) => (a === UNTAGGED ? 1 : b === UNTAGGED ? -1 : a.localeCompare(b)));
  }, [notes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((note) => {
      const tags = noteTags(note);
      if (exclude.some((tag) => tags.includes(tag))) return false;
      if (include.length > 0 && !include.every((tag) => tags.includes(tag))) return false;
      if (!q) return true;
      return note.title.toLowerCase().includes(q) || (note.content ?? "").toLowerCase().includes(q);
    });
  }, [notes, query, include, exclude]);

  const toggleTag = (tag: string) => {
    if (exclude.includes(tag)) {
      setExclude(exclude.filter((t) => t !== tag));
      return;
    }
    setInclude(include.includes(tag) ? include.filter((t) => t !== tag) : [...include, tag]);
  };

  const excludeTag = (tag: string) => {
    setInclude(include.filter((t) => t !== tag));
    setExclude(exclude.includes(tag) ? exclude.filter((t) => t !== tag) : [...exclude, tag]);
  };

  const create = () => {
    const id = createNote(db.db, { tags: serializeTags(include.filter((tag) => tag !== UNTAGGED)) });
    router.push({ pathname: "/note/[id]", params: { id } });
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Notes" actions={<IconButton icon="plus" label="New note" onPress={create} />}>
        <View className="h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
          <Icon name="search" size={16} colorClassName="accent-muted-foreground" />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            className="h-full flex-1"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        {allTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5">
            <View className="flex-row gap-2 px-5">
              {allTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tagLabel(tag)}
                  selected={include.includes(tag)}
                  tone={exclude.includes(tag) ? "excluded" : "default"}
                  onPress={() => toggleTag(tag)}
                  onLongPress={() => excludeTag(tag)}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </ScreenHeader>

      <FlatList
        data={visible}
        keyExtractor={(note) => note.id}
        contentContainerClassName="gap-3 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: contentInset }}
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <NoteCard note={item} onPress={() => router.push({ pathname: "/note/[id]", params: { id: item.id } })} />
        )}
        ListEmptyComponent={
          notes.length === 0 ? (
            <EmptyState icon="file-text" title="No notes yet" description="Tap + to write your first note." />
          ) : (
            <EmptyState icon="search" title="No matching notes" description="Long-press a tag to exclude it." />
          )
        }
      />
    </View>
  );
}

function NoteCard({ note, onPress }: { note: NoteItem; onPress: () => void }) {
  const title = note.title.trim();
  const preview = useMemo(() => markdownToPlainText(note.content ?? "", 220), [note.content]);
  const tags = parseTags(note.tags);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="gap-1.5 rounded-xl border border-border bg-card p-4 active:opacity-70"
    >
      {title ? <Text className="font-semibold text-base text-card-foreground">{title}</Text> : null}
      {preview ? (
        <Text numberOfLines={5} className="text-muted-foreground text-sm">
          {preview}
        </Text>
      ) : !title ? (
        <Text className="text-muted-foreground text-sm italic">Empty note</Text>
      ) : null}
      {tags.length > 0 && (
        <View className="mt-1 flex-row flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Text key={tag} className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground text-xs">
              #{tag}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}
