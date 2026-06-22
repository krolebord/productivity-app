import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checklist row rendered as a custom node view so each item carries a dnd-kit
 * drag handle. Dragging is pointer-based (works on touch, unlike the native
 * HTML5 drag the official DragHandle uses); the editor wrapper owns the
 * DndContext/SortableContext and performs the actual node move on drop.
 */
export function TaskItemView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const dragId = (node.attrs.dragId as string | null) ?? "";
  const checked = Boolean(node.attrs.checked);
  const sortable = useSortable({ id: dragId });

  return (
    <NodeViewWrapper
      as="li"
      data-checked={checked}
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      className={cn("note-task-item", sortable.isDragging && "is-dragging")}
    >
      <button
        type="button"
        contentEditable={false}
        suppressContentEditableWarning
        ref={sortable.setActivatorNodeRef}
        className="note-task-drag-handle"
        aria-label="Reorder item"
        {...sortable.attributes}
        {...sortable.listeners}
        onPointerDown={(e) => {
          // dnd-kit attaches its move/end listeners to the handle and relies on
          // pointer capture to keep receiving them; the mouse has no implicit
          // capture, so set it explicitly or the drag stalls once the cursor
          // leaves the (small) handle.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          sortable.listeners?.onPointerDown?.(e);
        }}
      >
        <GripVertical className="size-4" />
      </button>
      <label contentEditable={false} suppressContentEditableWarning>
        <input
          type="checkbox"
          checked={checked}
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ checked: e.target.checked })}
        />
        <span />
      </label>
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}
