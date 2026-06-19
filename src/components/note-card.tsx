import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";
import { NoteMarkdown } from "@/components/note-markdown";
import { parseTags } from "@/lib/tags";
import { useAttachToAssistant } from "@/lib/use-attach-to-assistant";
import { cn } from "@/lib/utils";
import type { NoteItem } from "@/user-db/migrations";
import { useDb } from "@/user-db/user-db";

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

  return (
    <div className="px-4 py-3">
      {note.title && <p className="mb-1 line-clamp-2 font-medium text-sm leading-snug">{note.title}</p>}
      {note.content ? (
        <NoteMarkdown
          content={note.content}
          className="max-h-72 overflow-hidden text-muted-foreground text-sm leading-relaxed"
        />
      ) : (
        !note.title && !tags.length && <p className="text-muted-foreground/50 text-sm italic">Empty note</p>
      )}
      {tags.length > 0 && (
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
  disabled?: boolean;
};

export function NoteCard({ note, onOpen, onTagClick, activeTags, disabled }: NoteCardProps) {
  const draggable = useDraggable({ id: note.id, disabled });
  const droppable = useDroppable({ id: note.id, disabled });

  const db = useDb();
  const { isContextKeyHeld, getAttachClickHandler } = useAttachToAssistant();
  const attachRef = { table: "item", id: note.id } as const;

  return (
    <div className="group">
      <div
        className={cn(
          "relative rounded-lg border bg-card text-card-foreground shadow-xs",
          // While dragging, the card stays in the grid as an invisible
          // placeholder so the empty slot reflows with the layout.
          draggable.isDragging && "opacity-0",
        )}
        ref={(el) => {
          draggable.setNodeRef(el);
          droppable.setNodeRef(el);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
      >
        {/* Hover actions */}
        <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete note"
            onClick={(e) => {
              e.stopPropagation();
              db.db.executeKysely((q) => q.deleteFrom("item").where("id", "=", note.id));
            }}
          >
            <Trash2 className="size-3.5" />
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
