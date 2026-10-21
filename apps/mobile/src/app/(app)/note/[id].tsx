import { deleteItem, type ItemFieldsPatch, updateItem, useItem } from "@productivity/core/data/items";
import { convertNoteToTask, useNoteTagSuggestions } from "@productivity/core/data/notes";
import { parseTags, serializeTags } from "@productivity/core/tags";
import { useDb } from "@productivity/core/user-db/db-context";
import type { NoteItem } from "@productivity/core/user-db/migrations";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { ActionButton } from "../../../components/action-button";
import { EmptyState } from "../../../components/empty-state";
import { FormSection } from "../../../components/form";
import { KeyboardScreen } from "../../../components/keyboard-screen";
import { SheetHeader } from "../../../components/screen-header";
import { TagEditor } from "../../../components/tag-editor";
import { useAutosave } from "../../../lib/use-autosave";

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const note = useItem(id);

  if (!note) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title="Note" onDone={() => router.back()} />
        <EmptyState icon="slash" title="This note no longer exists" />
      </View>
    );
  }
  return <NoteEditor note={note} />;
}

function NoteEditor({ note }: { note: NoteItem }) {
  const db = useDb();
  const router = useRouter();
  const tagSuggestions = useNoteTagSuggestions();
  const [fields, setFields] = useState({ title: note.title, content: note.content ?? "", tags: parseTags(note.tags) });
  const autosave = useAutosave((patch: ItemFieldsPatch) => updateItem(db.db, note.id, patch));
  const isNew = !note.title.trim() && !note.content?.trim();

  const update = (patch: Partial<typeof fields>) => {
    const next = { ...fields, ...patch };
    setFields(next);
    autosave.schedule({ ...next, tags: serializeTags(next.tags) });
  };

  const convertToTask = () => {
    autosave.flush();
    convertNoteToTask(db.db, note.id);
    router.replace({ pathname: "/task/[id]", params: { id: note.id } });
  };

  const confirmDelete = () =>
    Alert.alert("Delete note?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          autosave.cancel();
          deleteItem(db.db, note.id);
          router.back();
        },
      },
    ]);

  return (
    <KeyboardScreen header={<SheetHeader title={isNew ? "New note" : "Note"} onDone={() => router.back()} />}>
      <View className="gap-2">
        <TextInput
          value={fields.title}
          onChangeText={(title) => update({ title })}
          placeholder="Title"
          placeholderTextColorClassName="accent-muted-foreground"
          className="font-semibold text-foreground text-xl"
          multiline
          submitBehavior="blurAndSubmit"
        />
        <TextInput
          value={fields.content}
          onChangeText={(content) => update({ content })}
          placeholder="Write something… (markdown)"
          placeholderTextColorClassName="accent-muted-foreground"
          className="min-h-64 text-base text-foreground"
          multiline
          textAlignVertical="top"
          autoFocus={isNew}
        />
      </View>

      <FormSection title="Tags">
        <View className="px-4 py-2">
          <TagEditor value={fields.tags} onChange={(tags) => update({ tags })} suggestions={tagSuggestions} />
        </View>
      </FormSection>

      <View className="flex-row gap-3">
        <ActionButton icon="check-square" label="Make task" onPress={convertToTask} />
        <ActionButton icon="trash-2" label="Delete" destructive onPress={confirmDelete} />
      </View>
    </KeyboardScreen>
  );
}
