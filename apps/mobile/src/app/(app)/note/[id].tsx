import { deleteItem, useItem } from "@productivity/core/data/items";
import {
  convertNoteToTask,
  discardNoteIfBlank,
  isBlankNote,
  type NoteFields,
  saveNote,
} from "@productivity/core/data/notes";
import { parseTags, serializeTags } from "@productivity/core/tags";
import { useDb } from "@productivity/core/user-db/db-context";
import type { NoteItem } from "@productivity/core/user-db/migrations";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useAskAssistant, useAssistantEnabled } from "../../../components/assistant-button";
import { ItemDocumentEditor } from "../../../components/item-document-editor";
import { EditorAction } from "../../../components/item-editor";
import { SheetHeader } from "../../../components/screen-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { useAutosave } from "../../../lib/use-autosave";
import { useCloseWhenDeleted } from "../../../lib/use-close-when-deleted";

export default function NoteScreen() {
  // "New note" opens a fresh id with `draft` set: the row is only inserted once it has content.
  const { id, draft, tags } = useLocalSearchParams<{ id: string; draft?: string; tags?: string }>();
  const router = useRouter();
  const note = useItem(id);
  // Once seen, a missing row is handled by the editor (it closes); this is for a stale link.
  const [seen, setSeen] = useState(!!note);
  if (note && !seen) setSeen(true);

  if (!note && !draft && !seen) {
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
  const assistantEnabled = useAssistantEnabled();
  const ask = useAskAssistant();
  const [openedBlank] = useState(() => isBlankNote(note ?? {}));
  const [fields, setFields] = useState(() => ({
    title: note?.title ?? "",
    content: note?.content ?? "",
    tags: parseTags(note?.tags ?? draftTags),
  }));
  const fieldsRef = useRef(fields);
  const toNoteFields = (next: typeof fields): NoteFields => ({ ...next, tags: serializeTags(next.tags) });
  // Until its first save inserts it, a new note has no row; after that (or for a note opened
  // from its row) a missing row means it was deleted elsewhere, and saves mustn't recreate it.
  const isDraft = useRef(!note);
  const save = (value: NoteFields, options?: { insertBlank: boolean }) => {
    if (saveNote(db.db, id, value, { draft: isDraft.current, ...options })) isDraft.current = false;
  };
  const autosave = useAutosave((value: NoteFields) => save(value));
  const { expectDeletion } = useCloseWhenDeleted(note, {
    message: "This note was deleted elsewhere",
    onClose: () => {
      autosave.discard();
      router.back();
    },
  });

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

  const askAssistant = () => {
    // The assistant reads the synced row, so get the latest text into it first.
    autosave.cancel();
    save(toNoteFields(fieldsRef.current), { insertBlank: true });
    ask({ table: "item", id });
  };

  const convertToTask = () => {
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
          expectDeletion();
          deleteItem(db.db, id);
          router.back();
        },
      },
    ]);

  return (
    <ItemDocumentEditor
      kind="note"
      openedBlank={openedBlank}
      value={fields}
      onChange={update}
      onClose={() => router.back()}
      actions={
        assistantEnabled &&
        !isBlankNote(fields) && <EditorAction icon="message-circle" label="Ask assistant" onPress={askAssistant} />
      }
      menuItems={[
        { icon: "check-square", label: "Make task", onPress: convertToTask },
        { icon: "trash-2", label: "Delete note", destructive: true, onPress: confirmDelete },
      ]}
    />
  );
}
