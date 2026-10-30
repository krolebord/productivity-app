import { useDraggable, useDroppable } from "@dnd-kit/core";
import { deleteItem } from "@productivity/core/data/items";
import { parseTags } from "@productivity/core/tags";
import { useDb } from "@productivity/core/user-db/db-context";
import type { NoteItem } from "@productivity/core/user-db/migrations";
import { Trash2 } from "lucide-react";
import { NoteMarkdown } from "@/components/note-markdown";
import { useInlineConfirm } from "@/components/ui/inline-confirm";
import { useAttachToAssistant } from "@/lib/use-attach-to-assistant";
import { cn } from "@/lib/utils";

export function NoteCardContent({
  note,
  onTagClick,
  activeTags,
}: {
  note: NoteItem;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
}) {
  const tags = parseTags(note.tags);
  const active = new Set(activeTags);
  const hasMeta = tags.length > 0;

  return (
    <div className="px-4 py-3">
      {note.title && <p className="mb-1 line-clamp-2 font-medium text-sm leading-snug">{note.title}</p>}
      {note.content ? (
        <NoteMarkdown
          content={note.content}
          className="max-h-72 overflow-hidden text-muted-foreground text-sm leading-relaxed"
        />
      ) : (
        !note.title && !hasMeta && <p className="text-muted-foreground/50 text-sm italic">Empty note</p>
      )}
      {hasMeta && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => {
            const isActive = active.has(tag);
            const baseClass = "inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[11px]";
            const toneClass = isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";
            return onTagClick ? (
              <button
                key={tag}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(tag);
                }}
                className={cn(
                  baseClass,
                  toneClass,
                  "transition-colors",
                  isActive ? "hover:bg-primary/90" : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                #{tag}
              </button>
            ) : (
              <span key={tag} className={cn(baseClass, toneClass)}>
                #{tag}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

type NoteCardProps = {
  note: NoteItem;
  onOpen: () => void;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
  reorderDisabled?: boolean;
};

export function NoteCard({ note, onOpen, onTagClick, activeTags, reorderDisabled }: NoteCardProps) {
  const draggable = useDraggable({ id: note.id, data: { kind: "note" } });
  const droppable = useDroppable({ id: note.id, disabled: reorderDisabled });

  const db = useDb();
  const { isContextKeyHeld, getAttachClickHandler } = useAttachToAssistant();
  const attachRef = { table: "item", id: note.id } as const;
  // Click once to arm, again to delete, like the delete buttons in the editors.
  const deleteConfirm = useInlineConfirm({ onConfirm: () => deleteItem(db.db, note.id) });

  return (
    <div className="group">
      <div
        className={cn(
          "relative rounded-lg border bg-card text-card-foreground shadow-xs",
          draggable.isDragging && "opacity-0",
        )}
        ref={(el) => {
          draggable.setNodeRef(el);
          droppable.setNodeRef(el);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
      >
        <div
          className={cn(
            "absolute top-1.5 right-1.5 z-10 hidden transition-opacity group-hover:opacity-100 md:block",
            deleteConfirm.armed ? "opacity-100" : "opacity-0",
          )}
        >
          <button
            type="button"
            className={cn(
              "flex items-center gap-1 rounded-md p-1.5 text-xs transition-colors",
              deleteConfirm.armed
                ? "bg-destructive font-medium text-white hover:bg-destructive/90"
                : "text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive",
            )}
            aria-label={deleteConfirm.armed ? "Confirm delete note" : "Delete note"}
            {...deleteConfirm.getButtonProps()}
          >
            <Trash2 className="size-3.5" />
            {deleteConfirm.armed && <span>Delete?</span>}
          </button>
        </div>

        <div
          className={cn("select-none", isContextKeyHeld ? "cursor-copy" : "cursor-pointer")}
          onClick={isContextKeyHeld ? getAttachClickHandler(attachRef) : onOpen}
        >
          <NoteCardContent note={note} onTagClick={onTagClick} activeTags={activeTags} />
        </div>
      </div>
    </div>
  );
}
