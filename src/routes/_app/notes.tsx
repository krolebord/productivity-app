import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { closestCenter, DragOverlay } from "@dnd-kit/core";
import { formatForDisplay } from "@tanstack/hotkeys";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, PlusIcon, StickyNote, XIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { isCalendarDropTarget, useDndDelegate } from "@/components/app-dnd";
import { useMasonryLayout } from "@/components/masonry-grid";
import { NoteCard, NoteCardContent } from "@/components/note-card";
import { useCreateNote, useNoteDialogStore } from "@/components/note-dialog";
import { Button } from "@/components/ui/button";
import { NEW_NOTE_HOTKEY } from "@/lib/hotkeys";
import { parseTags } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { NoteItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

const notesSearchSchema = z.object({
  tags: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/_app/notes")({
  component: NotesPage,
  validateSearch: notesSearchSchema,
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
  const navigate = useNavigate();
  const search = Route.useSearch();
  const selectedTags = useMemo(() => search.tags ?? [], [search.tags]);
  const createNote = useCreateNote();
  const openNoteDialog = useNoteDialogStore((s) => s.open);

  const toggleTag = useCallback(
    (tag: string) => {
      navigate({
        to: "/notes",
        search: (prev) => {
          const current = prev.tags ?? [];
          const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
          return { tags: next.length > 0 ? next : undefined };
        },
      });
    },
    [navigate],
  );

  const clearTags = useCallback(() => {
    navigate({ to: "/notes", search: {} });
  }, [navigate]);

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

  const isFiltering = selectedTags.length > 0;

  // A note matches when it carries every selected tag (AND semantics).
  const visibleNotes = useMemo(() => {
    if (!isFiltering) return notes;
    return notes.filter((note) => {
      const tags = parseTags(note.tags);
      return selectedTags.every((tag) => tags.includes(tag));
    });
  }, [notes, selectedTags, isFiltering]);

  // Filter bar facets: tags present on the currently matching notes, with
  // counts. Because filtering is AND, this only surfaces tags that co-occur
  // with the selection — adding any of them keeps results non-empty. Selected
  // tags are always kept so they remain removable even if nothing matches.
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of visibleNotes) {
      for (const tag of parseTags(note.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    for (const tag of selectedTags) {
      if (!counts.has(tag)) counts.set(tag, 0);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleNotes, selectedTags]);

  // While a drag is in progress the order lives here, updated on every
  // drag-over so the grid reflows live under the pointer.
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // While hovering a Today-panel calendar day, the drag overlay collapses to a
  // small chip so the day cell under it stays visible. The chip is anchored to
  // the grab point because the overlay wrapper keeps the card's dimensions.
  const [overCalendar, setOverCalendar] = useState(false);
  const [grabOffset, setGrabOffset] = useState<{ x: number; y: number } | null>(null);

  const orderedNotes = useMemo(() => {
    if (!dragIds) return visibleNotes;
    const byId = new Map(visibleNotes.map((note) => [note.id, note]));
    const ordered = dragIds.flatMap((id) => byId.get(id) ?? []);
    if (ordered.length < visibleNotes.length) {
      const seen = new Set(dragIds);
      ordered.push(...visibleNotes.filter((note) => !seen.has(note.id)));
    }
    return ordered;
  }, [visibleNotes, dragIds]);

  const activeNote = useMemo(() => visibleNotes.find((note) => note.id === activeId), [visibleNotes, activeId]);

  const masonry = useMasonryLayout({
    items: orderedNotes,
    itemKey: noteKey,
    columnWidth: 240,
    gap: 16,
  });

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

    setOverCalendar(false);
    setGrabOffset(null);
  }

  // The active rect isn't measured yet in onDragStart, so the grab offset is
  // captured on the first move: activator coords are the drag-start pointer
  // position, and the initial rect is where the card was at that moment.
  function handleDragMove(event: DragMoveEvent) {
    if (grabOffset) return;
    const rect = event.active.rect.current.initial;
    const activator = event.activatorEvent;
    if (rect && activator instanceof PointerEvent) {
      setGrabOffset({ x: activator.clientX - rect.left, y: activator.clientY - rect.top });
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    setOverCalendar(over != null && isCalendarDropTarget(String(over.id)));
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
    setOverCalendar(false);
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

  // Drag handling lives in the app-shell AppDndProvider so notes can also be
  // dropped on Today-panel calendar days; this page owns everything else.
  useDndDelegate({
    collisionDetection,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: finishDrag,
  });

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

      {availableTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {availableTags.map(([tag, count]) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                #{tag}
                <span
                  className={cn("tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground/60")}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {isFiltering && (
            <Button onClick={clearTags} variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <XIcon className="size-3.5" />
              Clear
            </Button>
          )}
        </div>
      )}

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

      {notes.length > 0 && visibleNotes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <StickyNote className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No notes match these tags</p>
            <p className="text-muted-foreground text-sm">Try removing a tag to widen the results.</p>
          </div>
          <Button onClick={clearTags} variant="outline">
            <XIcon />
            Clear filters
          </Button>
        </div>
      )}

      <div {...masonry.outerProps}>
        <div {...masonry.innerProps}>
          {orderedNotes.map((note) => {
            const itemProps = masonry.getItemProps(note.id);
            return (
              <div key={note.id} ref={itemProps.ref} style={itemProps.style}>
                <NoteCard
                  note={note}
                  disabled={isFiltering}
                  onTagClick={toggleTag}
                  activeTags={selectedTags}
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
        {activeNote &&
          (overCalendar ? (
            <div className="relative h-full w-full">
              <div
                className="absolute flex w-max max-w-56 cursor-grabbing items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-card-foreground shadow-xl"
                style={
                  grabOffset
                    ? // Snap the chip to the cursor: centered horizontally, its
                      // bottom edge just above the pointer so the target day
                      // cell below stays visible.
                      { left: grabOffset.x, top: grabOffset.y, transform: "translate(-50%, calc(-100% - 2px))" }
                    : undefined
                }
              >
                <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{activeNote.title.trim() || "Untitled"}</span>
              </div>
            </div>
          ) : (
            <div className="cursor-grabbing rounded-lg border bg-card text-card-foreground shadow-xl">
              <NoteCardContent note={activeNote} />
            </div>
          ))}
      </DragOverlay>
    </div>
  );
}
