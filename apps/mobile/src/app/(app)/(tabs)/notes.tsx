import { useNoteViews } from "@productivity/core/data/note-views";
import {
  type NoteListItem,
  notePreviewMarkdown,
  useNoteSearchMatches,
  useNotesList,
} from "@productivity/core/data/notes";
import { filterTagCounts, filterTagOptions, matchesTagFilter, type TagFilter } from "@productivity/core/note-filter";
import { markdownToPlainText } from "@productivity/core/note-text";
import { effectiveMatch, noteViewSearch, viewMatchesSearch } from "@productivity/core/note-views";
import { parseTags, serializeTags, UNTAGGED } from "@productivity/core/tags";
import type { NoteViewItem } from "@productivity/core/user-db/migrations";
import { generateId } from "@sqlite-sync/core";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useTabContentInset } from "../../../components/assistant-button";
import { GlobalActions } from "../../../components/global-actions";
import { ScreenHeader } from "../../../components/screen-header";
import { Chip } from "../../../components/ui/chip";
import { EmptyState } from "../../../components/ui/empty-state";
import { Icon } from "../../../components/ui/icon";
import { IconButton } from "../../../components/ui/icon-button";
import { Input } from "../../../components/ui/input";

const tagLabel = (tag: string) => (tag === UNTAGGED ? "untagged" : `#${tag}`);

export default function NotesScreen() {
  const contentInset = useTabContentInset();
  const router = useRouter();
  const { notes } = useNotesList();
  const views = useNoteViews();
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<TagFilter["match"]>("all");
  // "Any" only means something with two or more tags, as on web.
  const filter = useMemo<TagFilter>(
    () => ({ include, exclude, match: effectiveMatch(include, matchMode) }),
    [include, exclude, matchMode],
  );
  const hasTagFilters = include.length > 0 || exclude.length > 0;

  const allTags = useMemo(() => filterTagOptions(notes, filter), [notes, filter]);
  const tagCounts = useMemo(() => filterTagCounts(notes, filter, allTags), [notes, filter, allTags]);

  const activeViewId = useMemo(() => {
    const current = { tags: include, not: exclude, match: filter.match === "any" ? ("any" as const) : undefined };
    return views.find((view) => viewMatchesSearch(view, current))?.id ?? null;
  }, [views, include, exclude, filter.match]);

  // The list only carries the start of each body; the search reads whole ones.
  const searchMatches = useNoteSearchMatches(query);
  const visible = useMemo(
    () => notes.filter((note) => matchesTagFilter(note, filter) && (!searchMatches || searchMatches.has(note.id))),
    [notes, searchMatches, filter],
  );

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

  const clearFilters = () => {
    setInclude([]);
    setExclude([]);
    setMatchMode("all");
  };

  const applyView = (view: NoteViewItem) => {
    const search = noteViewSearch(view);
    setInclude(search.tags ?? []);
    setExclude(search.not ?? []);
    setMatchMode(search.match ?? "all");
  };

  // The note row is only inserted once it gets content, so backing out of a new note leaves nothing behind.
  const create = () => {
    const tags = serializeTags(include.filter((tag) => tag !== UNTAGGED));
    router.push({ pathname: "/note/[id]", params: { id: generateId(), draft: "1", tags } });
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Notes"
        actions={
          <>
            <GlobalActions showNew={false} />
            <IconButton icon="plus" label="New note" onPress={create} />
          </>
        }
      >
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
        {views.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5">
            <View className="flex-row gap-2 px-5">
              <Chip label="All" selected={!hasTagFilters} onPress={clearFilters} />
              {views.map((view) => (
                <Chip
                  key={view.id}
                  label={view.name || "Untitled"}
                  selected={view.id === activeViewId}
                  onPress={() => (view.id === activeViewId ? clearFilters() : applyView(view))}
                />
              ))}
            </View>
          </ScrollView>
        )}
        {allTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5">
            <View className="flex-row gap-2 px-5">
              {hasTagFilters && views.length === 0 && <Chip label="Clear" onPress={clearFilters} />}
              {include.length >= 2 && <MatchToggle value={filter.match} onChange={setMatchMode} />}
              {allTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tagLabel(tag)}
                  count={tagCounts.get(tag)}
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
          <NoteCard
            note={item}
            activeTags={include}
            onTagPress={toggleTag}
            onPress={() => router.push({ pathname: "/note/[id]", params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          notes.length === 0 ? (
            <EmptyState icon="file-text" title="No notes yet" description="Tap + to write your first note." />
          ) : (
            <EmptyState
              icon="search"
              title="No matching notes"
              description={hasTagFilters ? "No notes match these tag filters." : "Try a different search."}
            >
              {hasTagFilters && (
                <Pressable
                  accessibilityRole="button"
                  onPress={clearFilters}
                  className="mt-3 h-10 justify-center rounded-lg border border-border px-4 active:bg-muted"
                >
                  <Text className="font-medium text-foreground">Clear filters</Text>
                </Pressable>
              )}
            </EmptyState>
          )
        }
      />
    </View>
  );
}

/** Whether a note needs all of the included tags or any one of them. */
function MatchToggle({
  value,
  onChange,
}: {
  value: TagFilter["match"];
  onChange: (match: TagFilter["match"]) => void;
}) {
  return (
    <View className="h-8 flex-row rounded-full border border-border bg-card p-0.5">
      {(["all", "any"] as const).map((mode) => {
        const selected = mode === value;
        return (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={`Match ${mode} tags`}
            accessibilityState={{ selected }}
            onPress={() => onChange(mode)}
            className={`justify-center rounded-full px-3 ${selected ? "bg-accent" : ""}`}
          >
            <Text className={`text-sm ${selected ? "font-medium text-accent-foreground" : "text-muted-foreground"}`}>
              {mode}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NoteCard({
  note,
  activeTags,
  onTagPress,
  onPress,
}: {
  note: NoteListItem;
  activeTags: string[];
  onTagPress: (tag: string) => void;
  onPress: () => void;
}) {
  const title = note.title.trim();
  const preview = useMemo(() => markdownToPlainText(notePreviewMarkdown(note.preview), 220), [note.preview]);
  const tags = parseTags(note.tags);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="gap-1.5 rounded-xl border border-border bg-card p-4 active:opacity-70"
    >
      {title ? (
        <Text numberOfLines={2} className="font-semibold text-base text-card-foreground">
          {title}
        </Text>
      ) : null}
      {preview ? (
        <Text numberOfLines={5} className="text-muted-foreground text-sm">
          {preview}
        </Text>
      ) : !title ? (
        <Text className="text-muted-foreground text-sm italic">Empty note</Text>
      ) : null}
      {tags.length > 0 && (
        <View className="mt-1 flex-row flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${tag}`}
                accessibilityState={{ selected: active }}
                onPress={() => onTagPress(tag)}
                hitSlop={4}
                className={`rounded-full px-2 py-0.5 active:opacity-70 ${active ? "bg-primary" : "bg-accent"}`}
              >
                <Text className={`text-xs ${active ? "text-primary-foreground" : "text-accent-foreground"}`}>
                  #{tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}
