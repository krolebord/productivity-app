import { type ReactNode, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { cn } from "../lib/utils";
import { EditorAction, EditorMetadata, EditorPanel, ItemEditor } from "./item-editor";
import { NoteDocument, type NoteDocumentHandle } from "./note-document";
import { ItemTagsSheet } from "./tag-picker";
import { ActionSheet, type ActionSheetItem } from "./ui/action-sheet";
import type { IconName } from "./ui/icon";
import { Input } from "./ui/input";

export type ItemDocumentFields = { title: string; content: string; tags: string[] };

/** Tasks and notes share the document experience; their routes own saving and domain actions. */
export function ItemDocumentEditor({
  kind,
  openedBlank,
  value,
  contentRevision = 0,
  onChange,
  onClose,
  completed = false,
  accessory,
  actions,
  trailingActions,
  menuItems,
  children,
}: {
  kind: "task" | "note";
  openedBlank: boolean;
  value: ItemDocumentFields;
  /** Bump when `value.content` was replaced from outside: the document only reads it on mount. */
  contentRevision?: number;
  onChange: (patch: Partial<ItemDocumentFields>) => void;
  onClose: () => void;
  completed?: boolean;
  accessory?: { label: string; icon: IconName; content: ReactNode; summary?: string };
  actions?: ReactNode;
  trailingActions?: ReactNode;
  menuItems: readonly ActionSheetItem[];
  children?: ReactNode;
}) {
  const [panel, setPanel] = useState<"accessory" | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const document = useRef<NoteDocumentHandle>(null);
  const [dragging, setDragging] = useState(false);
  const label = kind === "task" ? "Task" : "Note";
  const contentPlaceholder = kind === "task" ? "Add details…" : "Write something…";

  const togglePanel = (next: "accessory") => {
    Keyboard.dismiss();
    setPanel((current) => (current === next ? null : next));
  };
  const openTags = () => {
    Keyboard.dismiss();
    setPanel(null);
    setTagsOpen(true);
  };
  return (
    <>
      <ItemEditor
        title={openedBlank ? `New ${kind}` : label}
        onClose={onClose}
        scrollEnabled={!dragging}
        toolbar={
          <>
            {accessory && (
              <EditorAction
                icon={accessory.icon}
                label={accessory.label}
                selected={panel === "accessory"}
                onPress={() => togglePanel("accessory")}
              />
            )}
            <EditorAction icon="check-square" label="Add checklist" onPress={() => document.current?.addChecklist()} />
            <EditorAction icon="tag" label="Tags" onPress={openTags} />
            {actions}
            <View className="flex-1" />
            {trailingActions}
            <EditorAction
              icon="more-vertical"
              label="More actions"
              onPress={() => {
                Keyboard.dismiss();
                setMenuOpen(true);
              }}
            />
          </>
        }
        panel={
          panel === "accessory" && accessory ? (
            <EditorPanel key="accessory" title={accessory.label} onClose={() => setPanel(null)}>
              {accessory.content}
            </EditorPanel>
          ) : null
        }
      >
        <View className="gap-2">
          <Input
            accessibilityLabel={`${label} title`}
            value={value.title}
            onChangeText={(title) => onChange({ title })}
            placeholder={kind === "task" ? "What needs doing?" : "Title"}
            className={cn("font-semibold text-2xl", completed && "line-through opacity-60")}
            multiline
            submitBehavior="submit"
            onSubmitEditing={() => document.current?.focus()}
            autoFocus={openedBlank}
          />
          <NoteDocument
            key={contentRevision}
            ref={document}
            markdown={value.content}
            placeholder={contentPlaceholder}
            onChange={(content) => onChange({ content })}
            onDraggingChange={setDragging}
          />
        </View>
        {(accessory?.summary || value.tags.length > 0) && (
          <View className="flex-row flex-wrap gap-2">
            {accessory?.summary && (
              <EditorMetadata
                icon={accessory.icon}
                label={accessory.summary}
                onPress={() => togglePanel("accessory")}
              />
            )}
            {value.tags.length > 0 && (
              <EditorMetadata icon="tag" label={value.tags.map((tag) => `#${tag}`).join("  ")} onPress={openTags} />
            )}
          </View>
        )}
        {children}
        <ActionSheet
          visible={menuOpen}
          title={`${label} actions`}
          onClose={() => setMenuOpen(false)}
          items={menuItems}
        />
      </ItemEditor>
      <ItemTagsSheet
        kind={kind}
        open={tagsOpen}
        value={value.tags}
        onChange={(tags) => onChange({ tags })}
        onClose={() => setTagsOpen(false)}
      />
    </>
  );
}
