import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { formatForDisplay } from "@tanstack/hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, StickyNote } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMasonryLayout } from "@/components/masonry-grid";
import { NoteCard, NoteCardContent } from "@/components/note-card";
import { useCreateNote, useNoteDialogStore } from "@/components/note-dialog";
import { Button } from "@/components/ui/button";
import { NEW_NOTE_HOTKEY } from "@/lib/hotkeys";
import type { NoteItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/notes")({
  component: NotesPage,
});

const noteKey = (note: NoteItem) => note.id;

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const next = array.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function NotesPage() {
  const db = useDb();
  const createNote = useCreateNote();
  const openNoteDialog = useNoteDialogStore((s) => s.open);

  const { data: list } = useDbQuery(
    (db) => db.selectFrom("item").selectAll().where("type", "=", "note").orderBy("order", "asc"),
    {
      mapData: (notes) => ({
        notes: notes,
        timestamp: Date.now(),
      }),
    },
  );
  const [optimisticList, _setOptimisticList] = useState<typeof list>(list);

  const setOptimisticList = useCallback((notes: (typeof list)["notes"]) => {
    _setOptimisticList({
      notes,
      timestamp: Date.now(),
    });
  }, []);

  const notes = list.timestamp > optimisticList.timestamp ? list.notes : optimisticList.notes;

  // While a drag is in progress the order lives here, updated on every
  // drag-over so the grid reflows live under the pointer.
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const orderedNotes = useMemo(() => {
    if (!dragIds) return notes;
    const byId = new Map(notes.map((note) => [note.id, note]));
    const ordered = dragIds.flatMap((id) => byId.get(id) ?? []);
    if (ordered.length < notes.length) {
      const seen = new Set(dragIds);
      ordered.push(...notes.filter((note) => !seen.has(note.id)));
    }
    return ordered;
  }, [notes, dragIds]);

  const activeNote = useMemo(() => notes.find((note) => note.id === activeId), [notes, activeId]);

  const masonry = useMasonryLayout({
    items: orderedNotes,
    itemKey: noteKey,
    columnWidth: 240,
    gap: 16,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastReorderPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Collision detection runs against the masonry's computed target layout
  // instead of DOM rects, which are unreliable mid-transition. A rect the
  // pointer is inside wins outright; nearest center is only the fallback for
  // pointers in the gaps, since center distance alone flips between
  // neighbors at boundaries.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const inner = masonry.innerEl;
      const pointer = args.pointerCoordinates;
      if (!inner || !pointer || masonry.rects.size === 0) return closestCenter(args);
      lastPointerRef.current = { x: pointer.x, y: pointer.y };
      const innerRect = inner.getBoundingClientRect();
      let bestId: string | null = null;
      let bestDistance = Infinity;
      for (const [key, rect] of masonry.rects) {
        const left = innerRect.left + rect.x;
        const top = innerRect.top + rect.y;
        if (pointer.x >= left && pointer.x <= left + rect.width && pointer.y >= top && pointer.y <= top + rect.height) {
          return [{ id: String(key) }];
        }
        const dx = pointer.x - (left + rect.width / 2);
        const dy = pointer.y - (top + rect.height / 2);
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = String(key);
        }
      }
      return bestId ? [{ id: bestId }] : [];
    },
    [masonry.innerEl, masonry.rects],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setDragIds(notes.map((note) => note.id));
    lastPointerRef.current = null;
    lastReorderPointerRef.current = null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || over.id === active.id) return;

    // Reordering reflows the masonry, which can change the collision result
    // and fire another drag-over without the pointer moving. Only reorder
    // when the pointer has actually moved since the last reorder, otherwise
    // layouts where the placeholder lands away from the pointer oscillate
    // forever (and blow React's update depth).
    const pointer = lastPointerRef.current;
    const lastReorder = lastReorderPointerRef.current;
    if (pointer && lastReorder && Math.abs(pointer.x - lastReorder.x) < 1 && Math.abs(pointer.y - lastReorder.y) < 1) {
      return;
    }

    setDragIds((ids) => {
      if (!ids) return ids;
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1 || from === to) return ids;
      lastReorderPointerRef.current = pointer;
      return arrayMove(ids, from, to);
    });
  }

  // Suppress the click that fires on the card right after a drop, so a drag
  // doesn't also open the note dialog.
  const recentlyDraggedRef = useRef(false);
  const finishDrag = useCallback(() => {
    setActiveId(null);
    setDragIds(null);
    recentlyDraggedRef.current = true;
    setTimeout(() => {
      recentlyDraggedRef.current = false;
    }, 0);
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const finalIds = dragIds;
    finishDrag();
    if (!finalIds) return;

    const byId = new Map(notes.map((note) => [note.id, note]));
    const ordered = finalIds.flatMap((id) => byId.get(id) ?? []);
    if (ordered.length !== notes.length) return;
    if (ordered.every((note, i) => note.id === notes[i].id)) return;

    const movedId = String(event.active.id);
    const movedIndex = ordered.findIndex((note) => note.id === movedId);
    if (movedIndex === -1) return;

    // Place the moved note between its new neighbors with a fractional order;
    // fall back to renumbering everything when the midpoint runs out of
    // float precision or a neighbor has a null order.
    const prevOrder = movedIndex > 0 ? ordered[movedIndex - 1].order : undefined;
    const nextOrder = movedIndex < ordered.length - 1 ? ordered[movedIndex + 1].order : undefined;
    let movedOrder: number | null = null;
    if (typeof prevOrder === "number" && typeof nextOrder === "number") {
      const mid = (prevOrder + nextOrder) / 2;
      if (mid > prevOrder && mid < nextOrder) movedOrder = mid;
    } else if (typeof prevOrder === "number" && nextOrder === undefined) {
      movedOrder = prevOrder + 1;
    } else if (typeof nextOrder === "number" && prevOrder === undefined) {
      movedOrder = nextOrder - 1;
    }

    if (movedOrder !== null) {
      const order = movedOrder;
      setOptimisticList(ordered.map((note) => (note.id === movedId ? { ...note, order } : note)));
      db.db.executeKysely((q) => q.updateTable("item").set({ order }).where("id", "=", movedId));
    } else {
      setOptimisticList(ordered.map((note, i) => ({ ...note, order: i + 1 })));
      db.db.executeTransaction((trx) => {
        ordered.forEach((note, i) => {
          trx.executeKysely((q) =>
            q
              .updateTable("item")
              .set({ order: i + 1 })
              .where("id", "=", note.id),
          );
        });
      });
    }
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <h1 className="font-semibold text-xl">Notes</h1>
        <Button onClick={createNote} size="sm">
          <PlusIcon />
          New note
          <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
            {formatForDisplay(NEW_NOTE_HOTKEY)}
          </kbd>
        </Button>
      </div>

      {notes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <StickyNote className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No notes yet</p>
            <p className="text-muted-foreground text-sm">Create one to start capturing your thoughts.</p>
          </div>
          <Button onClick={createNote} variant="outline">
            <PlusIcon />
            New note
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={finishDrag}
      >
        <div {...masonry.outerProps}>
          <div {...masonry.innerProps}>
            {orderedNotes.map((note) => {
              const itemProps = masonry.getItemProps(note.id);
              return (
                <div key={note.id} ref={itemProps.ref} style={itemProps.style}>
                  <NoteCard
                    note={note}
                    onOpen={() => {
                      if (!recentlyDraggedRef.current) openNoteDialog(note.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeNote && (
            <div className="cursor-grabbing rounded-lg border bg-card text-card-foreground shadow-xl">
              <NoteCardContent note={activeNote} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
