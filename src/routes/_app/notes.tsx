import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { closestCenter, DragOverlay } from "@dnd-kit/core";
import { generateId } from "@sqlite-sync/core";
import { formatForDisplay } from "@tanstack/hotkeys";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, CheckIcon, MinusIcon, PlusIcon, SearchIcon, StickyNote, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { isCalendarDropTarget, useDndDelegate } from "@/components/app-dnd";
import { useMasonryLayout } from "@/components/masonry-grid";
import { NoteCard, NoteCardContent } from "@/components/note-card";
import { useCreateNote, useNoteDialogStore } from "@/components/note-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NEW_NOTE_HOTKEY } from "@/lib/hotkeys";
import {
  effectiveMatch,
  matchesNoteStatus,
  type NoteStatusFilter,
  noteViewSearch,
  viewMatchesSearch,
} from "@/lib/note-views";
import { parseTags, UNTAGGED } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { NoteItem, NoteViewItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

const tagFilterLabel = (tag: string) => (tag === UNTAGGED ? "untagged" : `#${tag}`);

/** Tags a note exposes to filtering; untagged notes match the pseudo-tag. */
function noteFilterTags(note: NoteItem): string[] {
  const tags = parseTags(note.tags);
  return tags.length > 0 ? tags : [UNTAGGED];
}

type TagFilter = { include: string[]; exclude: string[]; match: "all" | "any" };

// Excludes always apply (AND), regardless of the all/any mode, which only
// governs the included set. `ignoreExcluded` lets counts ask "what is this
// one exclusion hiding" by evaluating the filter without it.
function matchesTagFilter(note: NoteItem, filter: TagFilter, ignoreExcluded?: string): boolean {
  const tags = noteFilterTags(note);
  if (filter.exclude.some((tag) => tag !== ignoreExcluded && tags.includes(tag))) return false;
  if (filter.include.length === 0) return true;
  return filter.match === "all"
    ? filter.include.every((tag) => tags.includes(tag))
    : filter.include.some((tag) => tags.includes(tag));
}

const notesSearchSchema = z.object({
  tags: z.array(z.string()).optional(),
  not: z.array(z.string()).optional(),
  match: z.enum(["any"]).optional(),
  status: z.enum(["pending", "completed", "overdue"]).optional(),
  q: z.string().optional(),
});

const STATUS_OPTIONS: { value: NoteStatusFilter | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Done" },
];

type NotesSearch = z.infer<typeof notesSearchSchema>;

// The checklist rendered inside every tag-filter popover: row click toggles
// include, the trailing minus toggles exclude.
function TagFilterEditor({
  allTags,
  include,
  exclude,
  matchMode,
  rowCount,
  onToggleInclude,
  onToggleExclude,
  onMatchChange,
}: {
  allTags: string[];
  include: string[];
  exclude: string[];
  matchMode: TagFilter["match"];
  rowCount: (tag: string) => number;
  onToggleInclude: (tag: string) => void;
  onToggleExclude: (tag: string) => void;
  onMatchChange: (match: "any" | undefined) => void;
}) {
  return (
    <div className="flex max-h-80 w-60 flex-col overflow-auto p-1">
      <div className="mb-1 flex h-8 items-center justify-between border-b px-2 pb-1.5">
        <span className="text-muted-foreground text-xs">Filter by tag</span>
        {include.length >= 2 && (
          <div className="flex overflow-hidden rounded-md border text-xs">
            {(["all", "any"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onMatchChange(mode === "any" ? "any" : undefined)}
                className={cn(
                  "px-2 py-0.5 transition-colors",
                  matchMode === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
      </div>
      {allTags.map((tag) => {
        const included = include.includes(tag);
        const excluded = exclude.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggleInclude(tag)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <CheckIcon className={cn("size-3.5 shrink-0 text-primary", included ? "opacity-100" : "opacity-0")} />
            <span
              className={cn(
                "truncate",
                tag === UNTAGGED && "italic",
                excluded && "text-destructive line-through decoration-destructive/70",
              )}
            >
              {tagFilterLabel(tag)}
            </span>
            <span className="ml-auto text-muted-foreground/70 text-xs tabular-nums">{rowCount(tag)}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={excluded ? `Stop excluding ${tagFilterLabel(tag)}` : `Exclude ${tagFilterLabel(tag)}`}
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-destructive/10 hover:text-destructive",
                excluded ? "text-destructive" : "text-muted-foreground/50",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExclude(tag);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleExclude(tag);
                }
              }}
            >
              <MinusIcon className="size-3.5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
  const include = useMemo(() => search.tags ?? [], [search.tags]);
  const exclude = useMemo(() => search.not ?? [], [search.not]);
  const matchMode: TagFilter["match"] = search.match === "any" ? "any" : "all";
  const status = search.status;
  const query = search.q ?? "";

  // "Overdue" is time-dependent; tick every minute so notes crossing their due
  // time (and the segment counts) stay current while the page is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const createNote = useCreateNote();
  const openNoteDialog = useNoteDialogStore((s) => s.open);

  // The tag editor popover is anchored to the whole chip group (not the chip
  // that opened it): toggling filters from inside the editor mounts/unmounts
  // chips, and a popover anchored to an unmounting chip would close.
  const [filterOpen, setFilterOpen] = useState(false);
  const filterAnchorRef = useRef<HTMLDivElement>(null);

  const patchSearch = useCallback(
    (next: Partial<NotesSearch>) => {
      navigate({
        to: "/notes",
        search: (prev) => {
          const merged = { ...prev, ...next };
          const tags = merged.tags?.length ? merged.tags : undefined;
          return {
            tags,
            not: merged.not?.length ? merged.not : undefined,
            // "any" vs "all" only matters with 2+ included tags; drop it otherwise.
            match: tags && tags.length >= 2 && merged.match === "any" ? ("any" as const) : undefined,
            status: merged.status,
            q: merged.q || undefined,
          };
        },
      });
    },
    [navigate],
  );

  const toggleInclude = useCallback(
    (tag: string) => {
      patchSearch({
        tags: include.includes(tag) ? include.filter((t) => t !== tag) : [...include, tag],
        not: exclude.filter((t) => t !== tag),
      });
    },
    [patchSearch, include, exclude],
  );

  const toggleExclude = useCallback(
    (tag: string) => {
      patchSearch({
        tags: include.filter((t) => t !== tag),
        not: exclude.includes(tag) ? exclude.filter((t) => t !== tag) : [...exclude, tag],
      });
    },
    [patchSearch, include, exclude],
  );

  const clearFilters = useCallback(() => {
    patchSearch({ tags: undefined, not: undefined, match: undefined, status: undefined, q: undefined });
  }, [patchSearch]);

  const { data: views } = useDbQuery((db) =>
    db.selectFrom("note_view").selectAll().orderBy("order", "asc").orderBy("createdAt", "asc"),
  );

  // The view whose stored filter equals the current one; drives pill highlight
  // and hides "Save view" when the current filter is already saved.
  const activeViewId = useMemo(() => {
    const current = { tags: include, not: exclude, match: matchMode === "any" ? ("any" as const) : undefined, status };
    return views.find((view) => viewMatchesSearch(view, current))?.id ?? null;
  }, [views, include, exclude, matchMode, status]);

  const applyView = useCallback(
    (view: NoteViewItem) => {
      patchSearch(noteViewSearch(view));
    },
    [patchSearch],
  );

  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  const saveView = useCallback(() => {
    const name = viewName.trim();
    if (!name) return;
    const id = generateId();
    const now = Date.now();
    db.db.executeTransaction((trx) => {
      const [maxOrderRow] = trx.executeKysely((q) =>
        q.selectFrom("note_view").select((eb) => eb.fn.max("order").as("maxOrder")),
      ).rows;
      trx.executeKysely((q) =>
        q.insertInto("note_view").values({
          id,
          tombstone: false,
          name,
          include: JSON.stringify(include),
          exclude: JSON.stringify(exclude),
          match: effectiveMatch(include, matchMode),
          status: status ?? null,
          order: Number(maxOrderRow?.maxOrder ?? 0) + 1,
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
    setViewName("");
    setSaveViewOpen(false);
  }, [db, viewName, include, exclude, matchMode, status]);

  const deleteView = useCallback(
    (id: string) => {
      db.db.executeKysely((q) => q.deleteFrom("note_view").where("id", "=", id));
    },
    [db],
  );

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

  const filter = useMemo<TagFilter>(() => ({ include, exclude, match: matchMode }), [include, exclude, matchMode]);

  const hasTagFilter = include.length > 0 || exclude.length > 0;
  const isFiltering = hasTagFilter || status != null || query.length > 0;

  // Status applies before tags so the tag counts in the editor reflect it.
  const statusNotes = useMemo(() => {
    if (!status) return notes;
    return notes.filter((note) => matchesNoteStatus(note, status, now));
  }, [notes, status, now]);

  // Notes passing the status + tag filters, before the text query. Kept
  // separate so tag counts in the editor don't reflect the search box.
  const tagMatchedNotes = useMemo(() => {
    if (!hasTagFilter) return statusNotes;
    return statusNotes.filter((note) => matchesTagFilter(note, filter));
  }, [statusNotes, hasTagFilter, filter]);

  // Per-segment counts for the status control, within the current tag filter
  // (but ignoring the active status, so every segment shows its own reach).
  const statusCounts = useMemo(() => {
    const base = hasTagFilter ? notes.filter((note) => matchesTagFilter(note, filter)) : notes;
    const counts: Record<NoteStatusFilter, number> = { pending: 0, overdue: 0, completed: 0 };
    for (const note of base) {
      if (note.completedAt != null) counts.completed += 1;
      else {
        counts.pending += 1;
        if (matchesNoteStatus(note, "overdue", now)) counts.overdue += 1;
      }
    }
    return counts;
  }, [notes, hasTagFilter, filter, now]);

  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tagMatchedNotes;
    return tagMatchedNotes.filter(
      (note) => note.title.toLowerCase().includes(q) || (note.content ?? "").toLowerCase().includes(q),
    );
  }, [tagMatchedNotes, query]);

  // Every tag across all notes (the editor is a menu, so it lists the full
  // set, not just co-occurring facets), plus the untagged pseudo-tag last.
  // Filtered-on tags are always kept so they stay removable.
  const allFilterTags = useMemo(() => {
    const set = new Set<string>();
    let hasUntagged = false;
    for (const note of notes) {
      const tags = parseTags(note.tags);
      if (tags.length === 0) hasUntagged = true;
      for (const tag of tags) set.add(tag);
    }
    for (const tag of [...include, ...exclude]) {
      if (tag === UNTAGGED) hasUntagged = true;
      else set.add(tag);
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (hasUntagged) sorted.push(UNTAGGED);
    return sorted;
  }, [notes, include, exclude]);

  // Count shown on an editor row, answering "what does clicking this do":
  // excluded tags show how many notes the exclusion hides; in any-mode,
  // unselected tags show their own reach; otherwise co-occurrence within the
  // current tag matches (= results after adding the tag in all-mode).
  const rowCount = useCallback(
    (tag: string) => {
      if (exclude.includes(tag)) {
        return statusNotes.filter((note) => noteFilterTags(note).includes(tag) && matchesTagFilter(note, filter, tag))
          .length;
      }
      if (matchMode === "any" && include.length > 0 && !include.includes(tag)) {
        const alone: TagFilter = { include: [tag], exclude, match: "any" };
        return statusNotes.filter((note) => matchesTagFilter(note, alone)).length;
      }
      return tagMatchedNotes.filter((note) => noteFilterTags(note).includes(tag)).length;
    },
    [statusNotes, tagMatchedNotes, filter, include, exclude, matchMode],
  );

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
      // While filtering (including saved views), the grid isn't reorderable:
      // hidden notes make drop positions ambiguous. Report no collision so
      // the drag can only land on Today-panel calendar days (handled before
      // this delegate in AppDndProvider).
      if (isFiltering) return [];
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
    [isFiltering, masonry.innerEl, masonry.rects],
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
    if (isFiltering || !over || over.id === active.id) return;

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

      {(views.length > 0 || ((hasTagFilter || status != null) && activeViewId === null)) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => patchSearch({ tags: undefined, not: undefined, match: undefined, status: undefined })}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-3 font-medium text-xs transition-colors",
              !hasTagFilter && status == null
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            All
          </button>

          {views.map((view) => {
            const active = view.id === activeViewId;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => applyView(view)}
                className={cn(
                  "group/view inline-flex h-7 items-center gap-1 rounded-full border px-3 font-medium text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="max-w-[10rem] truncate">{view.name || "Untitled"}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Delete view ${view.name}`}
                  className={cn(
                    "-mr-1.5 hidden size-4 items-center justify-center rounded-full group-hover/view:flex",
                    active ? "hover:bg-primary-foreground/20" : "hover:bg-foreground/10",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteView(view.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteView(view.id);
                    }
                  }}
                >
                  <XIcon className="size-3" />
                </span>
              </button>
            );
          })}

          {(hasTagFilter || status != null) && activeViewId === null && (
            <Popover open={saveViewOpen} onOpenChange={setSaveViewOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-3 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
                >
                  <PlusIcon className="size-3" />
                  Save view
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveView();
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={viewName}
                    onChange={(event) => setViewName(event.currentTarget.value)}
                    placeholder="View name"
                    className="h-8"
                    autoFocus
                  />
                  <Button type="submit" size="sm" disabled={!viewName.trim()}>
                    Save
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {(notes.length > 0 || isFiltering) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => patchSearch({ q: event.currentTarget.value })}
              placeholder="Search notes"
              className="h-8 pl-9"
            />
          </div>

          <span className="hidden h-6 w-px self-center bg-border sm:block" />

          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverAnchor asChild>
              <div ref={filterAnchorRef} className="flex flex-wrap items-center gap-2">
                {include.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterOpen((open) => !open)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-0 pr-1 pl-3 text-blue-700 text-sm transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/50"
                  >
                    <span className="max-w-[16rem] truncate">
                      Tags{include.length >= 2 ? ` (${matchMode})` : ""}:{" "}
                      <span className="font-semibold">{include.map(tagFilterLabel).join(", ")}</span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Clear tag filter"
                      className="flex size-5 items-center justify-center rounded-full hover:bg-blue-200/70 dark:hover:bg-blue-800/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        patchSearch({ tags: undefined, match: undefined });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          patchSearch({ tags: undefined, match: undefined });
                        }
                      }}
                    >
                      <XIcon className="size-3.5" />
                    </span>
                  </button>
                )}

                {exclude.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterOpen((open) => !open)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 py-0 pr-1 pl-3 text-red-700 text-sm transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50"
                  >
                    <span className="max-w-[16rem] truncate">
                      Not: <span className="font-semibold">{exclude.map(tagFilterLabel).join(", ")}</span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Clear excluded tags"
                      className="flex size-5 items-center justify-center rounded-full hover:bg-red-200/70 dark:hover:bg-red-800/70"
                      onClick={(event) => {
                        event.stopPropagation();
                        patchSearch({ not: undefined });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          patchSearch({ not: undefined });
                        }
                      }}
                    >
                      <XIcon className="size-3.5" />
                    </span>
                  </button>
                )}

                {include.length === 0 && exclude.length === 0 && allFilterTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterOpen((open) => !open)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <PlusIcon className="size-3.5" />
                    Add filter
                  </button>
                )}
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              className="w-auto p-0"
              // Clicks on the anchor (chips, their clear buttons) must not
              // count as outside interactions, or clearing a chip while the
              // editor is open would dismiss it.
              onInteractOutside={(event) => {
                if (filterAnchorRef.current?.contains(event.target as Node)) event.preventDefault();
              }}
            >
              <TagFilterEditor
                allTags={allFilterTags}
                include={include}
                exclude={exclude}
                matchMode={matchMode}
                rowCount={rowCount}
                onToggleInclude={toggleInclude}
                onToggleExclude={toggleExclude}
                onMatchChange={(match) => patchSearch({ match })}
              />
            </PopoverContent>
          </Popover>

          <div className="flex h-8 items-center overflow-hidden rounded-full border bg-card text-xs">
            {STATUS_OPTIONS.map((option) => {
              const active = status === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => patchSearch({ status: option.value })}
                  className={cn(
                    "flex h-full items-center gap-1 px-2.5 transition-colors sm:px-3",
                    active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                  {option.value && (
                    <span className={cn("tabular-nums", active ? "text-muted-foreground" : "text-muted-foreground/60")}>
                      {statusCounts[option.value]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {(hasTagFilter || status != null) && (
            <button
              type="button"
              onClick={() => patchSearch({ tags: undefined, not: undefined, match: undefined, status: undefined })}
              className="ml-1 text-muted-foreground text-sm underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
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
            <p className="font-medium">No notes match these filters</p>
            <p className="text-muted-foreground text-sm">Try adjusting the tag filters or search.</p>
          </div>
          <Button onClick={clearFilters} variant="outline">
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
                  reorderDisabled={isFiltering}
                  onTagClick={toggleInclude}
                  activeTags={include}
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
