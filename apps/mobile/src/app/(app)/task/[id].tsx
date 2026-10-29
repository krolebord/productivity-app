import { parseDateKey } from "@productivity/core/agenda";
import { deleteItem, type ItemFieldsPatch, updateItem, useItem } from "@productivity/core/data/items";
import { detachTaskFromCalendar, useTaskTagSuggestions } from "@productivity/core/data/tasks";
import { localMidnightMs } from "@productivity/core/date-time";
import { isCalendarBackedTask } from "@productivity/core/google-calendar/mapping";
import { setMarkdownTaskChecked } from "@productivity/core/note-text";
import { parseTags, serializeTags } from "@productivity/core/tags";
import { useDb } from "@productivity/core/user-db/db-context";
import type { NoteItem } from "@productivity/core/user-db/migrations";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ActionButton } from "../../../components/action-button";
import { Markdown } from "../../../components/markdown";
import { SheetHeader } from "../../../components/screen-header";
import { TagEditor } from "../../../components/tag-editor";
import { TaskScheduleSection } from "../../../components/task-schedule";
import { EmptyState } from "../../../components/ui/empty-state";
import { FormSection } from "../../../components/ui/form";
import { Icon } from "../../../components/ui/icon";
import { Input } from "../../../components/ui/input";
import { KeyboardScreen } from "../../../components/ui/keyboard-screen";
import { useAutosave } from "../../../lib/use-autosave";

export default function TaskScreen() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const router = useRouter();
  const task = useItem(id);

  if (!task) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title="Task" onDone={() => router.back()} />
        <EmptyState icon="slash" title="This task no longer exists" />
      </View>
    );
  }
  return <TaskEditor task={task} defaultDay={day ? parseDateKey(day) : undefined} />;
}

function TaskEditor({ task, defaultDay }: { task: NoteItem; defaultDay?: Date }) {
  const db = useDb();
  const router = useRouter();
  const tagSuggestions = useTaskTagSuggestions();
  const [fields, setFields] = useState({
    title: task.title,
    content: task.content ?? "",
    tags: parseTags(task.tags),
    dueAt: task.dueAt ?? null,
    hasDueTime: task.hasDueTime,
    completedAt: task.completedAt ?? null,
  });
  const fieldsRef = useRef(fields);
  const [editingDetails, setEditingDetails] = useState(!task.content?.trim());
  const autosave = useAutosave((patch: ItemFieldsPatch) => updateItem(db.db, task.id, patch));

  const update = (patch: Partial<typeof fields>) => {
    const next = { ...fieldsRef.current, ...patch };
    fieldsRef.current = next;
    setFields(next);
    autosave.schedule({ ...next, tags: serializeTags(next.tags) });
  };

  const toggleChecklistItem = (item: { index: number; checked: boolean; text: string }) => {
    const content = setMarkdownTaskChecked(fieldsRef.current.content, item);
    // The item couldn't be told apart from another; let the user tick it in the source instead.
    if (content === fieldsRef.current.content) return setEditingDetails(true);
    update({ content });
    autosave.flush();
  };

  const toggleCompleted = () => {
    if (fields.completedAt != null) {
      update({ completedAt: null });
      return;
    }
    // Completing an inbox task schedules it for today, so it shows up in the day it was done.
    update({
      dueAt: fields.dueAt ?? localMidnightMs(new Date()),
      hasDueTime: fields.dueAt == null ? false : fields.hasDueTime,
      completedAt: Date.now(),
    });
  };

  const confirmDelete = () =>
    Alert.alert("Delete task?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // Also stops the tag editor's unmount commit from re-inserting the deleted row.
          autosave.discard();
          deleteItem(db.db, task.id);
          router.back();
        },
      },
    ]);

  const completed = fields.completedAt != null;

  return (
    <KeyboardScreen
      header={
        <SheetHeader
          title="Task"
          onCancel={() => setEditingDetails(!editingDetails)}
          cancelLabel={editingDetails ? "Preview" : "Edit"}
          onDone={() => router.back()}
        />
      }
    >
      <View className="gap-2">
        <Input
          value={fields.title}
          onChangeText={(title) => update({ title })}
          placeholder="What needs doing?"
          className={`font-semibold text-xl ${completed ? "line-through opacity-60" : ""}`}
          multiline
          submitBehavior="blurAndSubmit"
          autoFocus={!task.title && !task.content}
        />
        {editingDetails ? (
          <Input
            value={fields.content}
            onChangeText={(content) => update({ content })}
            placeholder="Add details… (markdown)"
            className="min-h-24"
            multiline
            textAlignVertical="top"
            // Opening the editor from a rendered task focuses it; a new task focuses the title instead.
            autoFocus={!!task.content?.trim()}
          />
        ) : fields.content.trim() ? (
          <Markdown markdown={fields.content} onToggleTask={toggleChecklistItem} />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setEditingDetails(true)} className="min-h-12 py-1">
            <Text className="text-base text-muted-foreground">Add details…</Text>
          </Pressable>
        )}
      </View>

      <FormSection title="Tags">
        <View className="px-4 py-2">
          <TagEditor value={fields.tags} onChange={(tags) => update({ tags })} suggestions={tagSuggestions} />
        </View>
      </FormSection>

      <TaskScheduleSection
        dueAt={fields.dueAt}
        hasDueTime={fields.hasDueTime}
        defaultDay={defaultDay}
        onChange={update}
      />

      {isCalendarBackedTask(task) && (
        <View className="flex-row items-start gap-2 px-1">
          <Icon name="calendar" size={14} colorClassName="accent-muted-foreground" />
          <Text className="flex-1 text-muted-foreground text-sm">
            Mirrored from Google Calendar — title, time and details are overwritten on sync.{" "}
            <Text className="text-primary" onPress={() => detachTaskFromCalendar(db.db, task.id)}>
              Unlink
            </Text>
          </Text>
        </View>
      )}

      <View className="flex-row gap-3">
        <ActionButton
          icon={completed ? "rotate-ccw" : "check"}
          label={completed ? "Reopen" : "Complete"}
          onPress={toggleCompleted}
        />
        <ActionButton icon="trash-2" label="Delete" destructive onPress={confirmDelete} />
      </View>
    </KeyboardScreen>
  );
}
