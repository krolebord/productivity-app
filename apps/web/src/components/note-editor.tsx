import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Placeholder } from "@tiptap/extensions";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { type Ref, useImperativeHandle, useRef } from "react";
import { noteExtensions, parseNoteMarkdown } from "./note-extensions";

export type NoteEditorHandle = {
  focus: () => void;
};

type NoteEditorProps = {
  ref?: Ref<NoteEditorHandle>;
  initialContent: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onEscape?: () => void;
};

function findTaskItem(doc: PMNode, dragId: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "taskItem" && node.attrs.dragId === dragId) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Move the active task item to the position of the item it was dropped on.
 * Reordering is restricted to siblings within the same list (flat reorder),
 * so dragging across lists or nesting levels is a no-op.
 */
function moveTaskItem(editor: Editor, activeId: string, overId: string) {
  const { state } = editor;
  const active = findTaskItem(state.doc, activeId);
  const over = findTaskItem(state.doc, overId);
  if (!active || !over) return;

  const $active = state.doc.resolve(active.pos);
  const $over = state.doc.resolve(over.pos);
  if ($active.depth !== $over.depth || $active.before($active.depth) !== $over.before($over.depth)) return;

  const children: PMNode[] = [];
  $active.parent.forEach((child) => {
    children.push(child);
  });
  const [moved] = children.splice($active.index(), 1);
  children.splice($over.index(), 0, moved);

  editor.view.dispatch(state.tr.replaceWith($active.start(), $active.end(), Fragment.fromArray(children)));
}

export function NoteEditor({ ref, initialContent, placeholder, onChange, onEscape }: NoteEditorProps) {
  const callbacksRef = useRef({ onChange, onEscape });
  callbacksRef.current = { onChange, onEscape };

  const editor = useEditor({
    extensions: [...noteExtensions, Placeholder.configure({ placeholder: placeholder ?? "" })],
    content: parseNoteMarkdown(initialContent),
    editorProps: {
      attributes: {
        class: "note-prose min-h-40 py-1 outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          callbacksRef.current.onEscape?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      callbacksRef.current.onChange(editor.getMarkdown());
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus("end"),
    }),
    [editor],
  );

  const taskIds = useEditorState({
    editor,
    selector: ({ editor }) => {
      const ids: string[] = [];
      editor?.state.doc.descendants((node) => {
        if (node.type.name === "taskItem" && node.attrs.dragId) ids.push(node.attrs.dragId);
      });
      return ids;
    },
    equalityFn: (a, b) => a.length === (b ?? []).length && a.every((id, i) => id === (b ?? [])[i]),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!editor || !over || active.id === over.id) return;
    moveTaskItem(editor, active.id as string, over.id as string);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={taskIds ?? []} strategy={verticalListSortingStrategy}>
        <EditorContent editor={editor} />
      </SortableContext>
    </DndContext>
  );
}
