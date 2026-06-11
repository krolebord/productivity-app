import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";
import { NoteMarkdown } from "@/components/note-markdown";
import { cn } from "@/lib/utils";
import type { NoteItem } from "@/user-db/migrations";
import { useDb } from "@/user-db/user-db";

export function NoteCardContent({ note }: { note: NoteItem }) {
  return (
    <div className="px-4 py-3">
      {note.title && <p className="mb-1 line-clamp-2 font-medium text-sm leading-snug">{note.title}</p>}
      {note.content ? (
        <NoteMarkdown
          content={note.content}
          className="max-h-72 overflow-hidden text-muted-foreground text-sm leading-relaxed"
        />
      ) : (
        !note.title && <p className="text-muted-foreground/50 text-sm italic">Empty note</p>
      )}
    </div>
  );
}

type NoteCardProps = {
  note: NoteItem;
  onOpen: () => void;
};

export function NoteCard({ note, onOpen }: NoteCardProps) {
  const draggable = useDraggable({ id: note.id });
  const droppable = useDroppable({ id: note.id });

  const db = useDb();

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

        <div className="cursor-pointer select-none" onClick={onOpen}>
          <NoteCardContent note={note} />
        </div>
      </div>
    </div>
  );
}
