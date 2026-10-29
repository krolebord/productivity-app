import { deleteItem, useItem } from "@productivity/core/data/items";
import {
  convertNoteToTask,
  discardNoteIfBlank,
  isBlankNote,
  type NoteFields,
  saveNote,
  useNoteTagSuggestions,
} from "@productivity/core/data/notes";
import { setMarkdownTaskChecked } from "@productivity/core/note-text";
import { parseTags, serializeTags } from "@productivity/core/tags";
import { useDb } from "@productivity/core/user-db/db-context";
import type { NoteItem } from "@productivity/core/user-db/migrations";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ActionButton } from "../../../components/action-button";
import { Markdown } from "../../../components/markdown";
import { SheetHeader } from "../../../components/screen-header";
import { TagEditor, type TagEditorHandle } from "../../../components/tag-editor";
import { EmptyState } from "../../../components/ui/empty-state";
import { FormSection } from "../../../components/ui/form";
import { Input } from "../../../components/ui/input";
import { KeyboardScreen } from "../../../components/ui/keyboard-screen";
import { useAutosave } from "../../../lib/use-autosave";

export default function NoteScreen() {
  // "New note" opens a fresh id with `draft` set: the row is only inserted once it has content.
  const { id, draft, tags } = useLocalSearchParams<{ id: string; draft?: string; tags?: string }>();
  const router = useRouter();
  const note = useItem(id);

  if (!note && !draft) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title="Note" onDone={() => router.back()} />
        <EmptyState icon="slash" title="This note no longer exists" />
      </View>
    );
  }
  return <NoteEditor id={id} note={note} draftTags={tags} />;
}

function NoteEditor({ id, note, draftTags }: { id: string; note: NoteItem | undefined; draftTags?: string }) {
  const db = useDb();
  const router = useRouter();
  const tagSuggestions = useNoteTagSuggestions();
  const [openedBlank] = useState(() => isBlankNote(note ?? {}));
  const [editing, setEditing] = useState(openedBlank);
  const [fields, setFields] = useState(() => ({
    title: note?.title ?? "",
    content: note?.content ?? "",
    tags: parseTags(note?.tags ?? draftTags),
  }));
  const fieldsRef = useRef(fields);
  const tagEditor = useRef<TagEditorHandle>(null);
  const toNoteFields = (next: typeof fields): NoteFields => ({ ...next, tags: serializeTags(next.tags) });
  // Until its first save inserts it, a new note has no row; after that (or for a note opened
  // from its row) a missing row means it was deleted elsewhere, and saves mustn't recreate it.
  const isDraft = useRef(!note);
  const save = (value: NoteFields, options?: { insertBlank: boolean }) => {
    if (saveNote(db.db, id, value, { draft: isDraft.current, ...options })) isDraft.current = false;
  };
  const autosave = useAutosave((value: NoteFields) => save(value));

  // Runs after useAutosave's unmount flush: a note opened blank and left blank is discarded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on unmount.
  useEffect(
    () => () => {
      if (openedBlank) discardNoteIfBlank(db.db, id);
    },
    [],
  );

  const update = (patch: Partial<typeof fields>) => {
    const next = { ...fieldsRef.current, ...patch };
    fieldsRef.current = next;
    setFields(next);
    autosave.schedule(toNoteFields(next));
  };

  const toggleTask = (task: { index: number; checked: boolean; text: string }) => {
    const content = setMarkdownTaskChecked(fieldsRef.current.content, task);
    // The item couldn't be told apart from another; let the user tick it in the source instead.
    if (content === fieldsRef.current.content) return setEditing(true);
    update({ content });
    autosave.flush();
  };

  const convertToTask = () => {
    tagEditor.current?.commit();
    autosave.cancel();
    save(toNoteFields(fieldsRef.current), { insertBlank: true });
    convertNoteToTask(db.db, id);
    router.replace({ pathname: "/task/[id]", params: { id } });
  };

  const confirmDelete = () =>
    Alert.alert("Delete note?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // Also stops the tag editor's unmount commit from re-inserting the deleted row.
          autosave.discard();
          deleteItem(db.db, id);
          router.back();
        },
      },
    ]);

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title={openedBlank ? "New note" : "Note"}
          onCancel={() => setEditing(!editing)}
          cancelLabel={editing ? "Preview" : "Edit"}
          onDone={() => router.back()}
        />
      }
    >
      <View className="gap-2">
        <Input
          value={fields.title}
          onChangeText={(title) => update({ title })}
          placeholder="Title"
          className="font-semibold text-xl"
          multiline
          submitBehavior="blurAndSubmit"
        />
        {editing ? (
          <Input
            value={fields.content}
            onChangeText={(content) => update({ content })}
            placeholder="Write something… (markdown)"
            className="min-h-64"
            multiline
            textAlignVertical="top"
            autoFocus
          />
        ) : fields.content.trim() ? (
          <Markdown markdown={fields.content} onToggleTask={toggleTask} style={{ minHeight: 64 }} />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setEditing(true)} className="min-h-16 py-1">
            <Text className="text-base text-muted-foreground">Tap to write…</Text>
          </Pressable>
        )}
      </View>

      <FormSection title="Tags">
        <View className="px-4 py-2">
          <TagEditor
            ref={tagEditor}
            value={fields.tags}
            onChange={(tags) => update({ tags })}
            suggestions={tagSuggestions}
          />
        </View>
      </FormSection>

      <View className="flex-row gap-3">
        <ActionButton icon="check-square" label="Make task" onPress={convertToTask} />
        <ActionButton icon="trash-2" label="Delete" destructive onPress={confirmDelete} />
      </View>
    </KeyboardScreen>
  );
}
