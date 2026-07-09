import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, PointerSensor, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { format } from "date-fns";
import { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useRef } from "react";
import { parseDateKey } from "@/lib/agenda";
import { combineLocalDateAndTime, localMidnightMs } from "@/lib/date-time";
import { useDb } from "@/user-db/user-db";

const CALENDAR_DAY_PREFIX = "calendar-day:";

export function calendarDayDroppableId(dateKey: string): string {
  return `${CALENDAR_DAY_PREFIX}${dateKey}`;
}

/** Whole Today-view surface; keeps drags in "calendar mode" between day cells. */
export const TODAY_AREA_DROPPABLE_ID = "today-area";

export function isCalendarDayDroppableId(id: string): boolean {
  return id.startsWith(CALENDAR_DAY_PREFIX);
}

/** True for anything in the Today view — a day cell or the area around them. */
export function isCalendarDropTarget(id: string): boolean {
  return isCalendarDayDroppableId(id) || id === TODAY_AREA_DROPPABLE_ID;
}

function calendarDayFromDroppableId(id: string): string | null {
  return id.startsWith(CALENDAR_DAY_PREFIX) ? id.slice(CALENDAR_DAY_PREFIX.length) : null;
}

export type DndDelegate = {
  collisionDetection: CollisionDetection;
  onDragStart: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
};

const DndDelegateContext = createContext<RefObject<DndDelegate | null> | null>(null);

/**
 * Registers the calling page as the handler for drags that don't land on a
 * calendar day (e.g. the notes grid reorder). Re-read every render so the
 * delegate's closures stay fresh; cleared on unmount.
 */
export function useDndDelegate(delegate: DndDelegate) {
  const ref = useContext(DndDelegateContext);
  if (!ref) throw new Error("useDndDelegate must be used within AppDndProvider");
  useEffect(() => {
    ref.current = delegate;
  });
  useEffect(() => {
    return () => {
      ref.current = null;
    };
  }, [ref]);
}

/**
 * App-wide drag context. Draggables and droppables only connect within one
 * DndContext, so it lives at the shell: this is what lets a note card dragged
 * on the notes page drop onto a Today-panel calendar day in another subtree.
 */
export function AppDndProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const delegateRef = useRef<DndDelegate | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // A calendar day the pointer is inside wins outright, then the Today area as
  // a whole (a no-op drop target that keeps the overlay in calendar mode
  // between day cells); everything else is the owning page's collision logic
  // (defaulting to closestCenter).
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const dayContainers = args.droppableContainers.filter(
      (container) => calendarDayFromDroppableId(String(container.id)) != null,
    );
    if (dayContainers.length > 0) {
      const hits = pointerWithin({ ...args, droppableContainers: dayContainers });
      if (hits.length > 0) return hits;
    }

    const areaContainers = args.droppableContainers.filter(
      (container) => String(container.id) === TODAY_AREA_DROPPABLE_ID,
    );
    if (areaContainers.length > 0) {
      const hits = pointerWithin({ ...args, droppableContainers: areaContainers });
      if (hits.length > 0) return hits;
    }

    const rest = args.droppableContainers.filter((container) => !isCalendarDropTarget(String(container.id)));
    const restArgs = { ...args, droppableContainers: rest };
    const delegate = delegateRef.current;
    return delegate ? delegate.collisionDetection(restArgs) : closestCenter(restArgs);
  }, []);

  const rescheduleNoteToDay = useCallback(
    (noteId: string, dateKey: string) => {
      db.db.executeTransaction((trx) => {
        const [note] = trx.executeKysely((q) =>
          q.selectFrom("item").select(["dueAt", "hasDueTime"]).where("id", "=", noteId),
        ).rows;
        if (!note) return;

        const day = parseDateKey(dateKey);
        const dueAt =
          note.hasDueTime && note.dueAt != null
            ? combineLocalDateAndTime(day, format(note.dueAt, "HH:mm"))
            : localMidnightMs(day);
        // Rescheduling revives a completed agenda item (same rule as the dialog).
        trx.executeKysely((q) => q.updateTable("item").set({ dueAt, completedAt: null }).where("id", "=", noteId));
      });
    },
    [db],
  );

  return (
    <DndDelegateContext.Provider value={delegateRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(event) => delegateRef.current?.onDragStart(event)}
        onDragMove={(event) => delegateRef.current?.onDragMove?.(event)}
        onDragOver={(event) => delegateRef.current?.onDragOver(event)}
        onDragEnd={(event) => {
          const overId = event.over ? String(event.over.id) : null;
          const dateKey = overId != null ? calendarDayFromDroppableId(overId) : null;
          if (dateKey != null) {
            rescheduleNoteToDay(String(event.active.id), dateKey);
            // The page still resets its in-flight drag state (no reorder happened).
            delegateRef.current?.onDragCancel();
            return;
          }
          // Dropped on the Today area but not on a day: no-op.
          if (overId === TODAY_AREA_DROPPABLE_ID) {
            delegateRef.current?.onDragCancel();
            return;
          }
          delegateRef.current?.onDragEnd(event);
        }}
        onDragCancel={() => delegateRef.current?.onDragCancel()}
      >
        {children}
      </DndContext>
    </DndDelegateContext.Provider>
  );
}
