import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, PointerSensor, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { format } from "date-fns";
import { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useRef } from "react";
import { parseDateKey } from "@/lib/agenda";
import { calendarDayFromDroppableId } from "@/lib/app-dnd";
import { combineLocalDateAndTime, localMidnightMs } from "@/lib/date-time";
import { useDb } from "@/user-db/user-db";

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
 * Registers the calling page as the active drag handler. Re-read every render
 * so the delegate's closures stay fresh; cleared on unmount.
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
 * DndContext, so it lives at the shell. Calendar drops are handled here while
 * page-specific interactions, such as note reordering, stay delegated.
 */
export function AppDndProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const delegateRef = useRef<DndDelegate | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const calendarDays = args.droppableContainers.filter(
      (container) => calendarDayFromDroppableId(String(container.id)) != null,
    );
    if (calendarDays.length > 0) {
      const hits = pointerWithin({ ...args, droppableContainers: calendarDays });
      if (hits.length > 0) return hits;
    }

    const rest = args.droppableContainers.filter(
      (container) => calendarDayFromDroppableId(String(container.id)) == null,
    );
    const restArgs = { ...args, droppableContainers: rest };
    const delegate = delegateRef.current;
    return delegate ? delegate.collisionDetection(restArgs) : closestCenter(restArgs);
  }, []);

  /** Schedules a task on the given day; a dropped note is converted into a task first. */
  const scheduleItemOnDay = useCallback(
    (itemId: string, dateKey: string) => {
      db.db.executeTransaction((trx) => {
        const [item] = trx.executeKysely((q) =>
          q.selectFrom("item").select(["type", "dueAt", "hasDueTime"]).where("id", "=", itemId),
        ).rows;
        if (!item) return;

        const day = parseDateKey(dateKey);
        if (item.type === "note") {
          trx.executeKysely((q) =>
            q
              .updateTable("item")
              .set({ type: "task", dueAt: localMidnightMs(day), hasDueTime: false, completedAt: null })
              .where("id", "=", itemId),
          );
          return;
        }

        const dueAt =
          item.hasDueTime && item.dueAt != null
            ? combineLocalDateAndTime(day, format(item.dueAt, "HH:mm"))
            : localMidnightMs(day);
        trx.executeKysely((q) => q.updateTable("item").set({ type: "task", dueAt }).where("id", "=", itemId));
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
          const dateKey = overId ? calendarDayFromDroppableId(overId) : null;
          const kind = event.active.data.current?.kind;
          if (dateKey && (kind === "task" || kind === "note")) {
            scheduleItemOnDay(String(event.active.id), dateKey);
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
