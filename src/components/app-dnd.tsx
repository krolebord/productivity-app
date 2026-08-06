import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { format } from "date-fns";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { parseDateKey } from "@/lib/agenda";
import { dayDropDateKey, INBOX_DROP_ID, isDropZoneId } from "@/lib/app-dnd";
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

type DndDelegateRegistry = {
  /** Keep the live delegate object for `kind` (re-read every render for fresh closures). */
  set: (kind: string, delegate: DndDelegate) => void;
  clear: (kind: string) => void;
  get: (kind: string | undefined) => DndDelegate | null;
};

const DndDelegateContext = createContext<DndDelegateRegistry | null>(null);

export type ActiveDrag = { id: string; kind: string | undefined };

const ActiveDragContext = createContext<ActiveDrag | null>(null);

/** The item currently being dragged anywhere in the app, or null. Lets pages reveal drop zones mid-drag. */
export function useActiveDrag(): ActiveDrag | null {
  return useContext(ActiveDragContext);
}

function activeKind(event: {
  active: { data: { current?: Record<string, unknown> | undefined } };
}): string | undefined {
  const kind = event.active.data.current?.kind;
  return typeof kind === "string" ? kind : undefined;
}

/**
 * Registers the calling page as the drag handler for a given item kind
 * (`"note"`, `"task"`, …). Re-read every render so closures stay fresh;
 * cleared on unmount. Multiple kinds can be registered at once (e.g. today
 * panel + notes page).
 */
export function useDndDelegate(kind: string, delegate: DndDelegate) {
  const registry = useContext(DndDelegateContext);
  if (!registry) throw new Error("useDndDelegate must be used within AppDndProvider");
  useEffect(() => {
    registry.set(kind, delegate);
  });
  useEffect(() => {
    return () => {
      registry.clear(kind);
    };
  }, [registry, kind]);
}

/**
 * App-wide drag context. Draggables and droppables only connect within one
 * DndContext, so it lives at the shell. Calendar drops are handled here while
 * page-specific interactions, such as note or task reordering, stay delegated
 * by item kind.
 */
export function AppDndProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const delegatesRef = useRef(new Map<string, DndDelegate>());
  const registry = useRef<DndDelegateRegistry>({
    set: (kind, delegate) => {
      delegatesRef.current.set(kind, delegate);
    },
    clear: (kind) => {
      delegatesRef.current.delete(kind);
    },
    get: (kind) => (kind ? (delegatesRef.current.get(kind) ?? null) : null),
  }).current;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const zones = args.droppableContainers.filter((container) => isDropZoneId(String(container.id)));
      if (zones.length > 0) {
        const hits = pointerWithin({ ...args, droppableContainers: zones });
        if (hits.length > 0) return hits;
      }

      const rest = args.droppableContainers.filter((container) => !isDropZoneId(String(container.id)));
      const restArgs = { ...args, droppableContainers: rest };
      const kind = typeof args.active.data.current?.kind === "string" ? args.active.data.current.kind : undefined;
      const delegate = registry.get(kind);
      return delegate ? delegate.collisionDetection(restArgs) : closestCenter(restArgs);
    },
    [registry],
  );

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

  /** Unschedules an item into the inbox; a dropped note becomes an undated task. */
  const moveItemToInbox = useCallback(
    (itemId: string) => {
      db.db.executeTransaction((trx) => {
        const [maxOrderRow] = trx.executeKysely((q) =>
          q
            .selectFrom("item")
            .select((eb) => eb.fn.max("order").as("maxOrder"))
            .where("type", "=", "task"),
        ).rows;
        trx.executeKysely((q) =>
          q
            .updateTable("item")
            .set({
              type: "task",
              dueAt: null,
              hasDueTime: false,
              completedAt: null,
              order: Number(maxOrderRow?.maxOrder ?? 0) + 1,
            })
            .where("id", "=", itemId),
        );
      });
    },
    [db],
  );

  return (
    <DndDelegateContext.Provider value={registry}>
      <ActiveDragContext.Provider value={activeDrag}>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          // The inbox drop target is only enabled once a drag starts, so containers
          // must be re-measured after that first render rather than only on drag start.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={(event) => {
            setActiveDrag({ id: String(event.active.id), kind: activeKind(event) });
            registry.get(activeKind(event))?.onDragStart(event);
          }}
          onDragMove={(event) => registry.get(activeKind(event))?.onDragMove?.(event)}
          onDragOver={(event) => registry.get(activeKind(event))?.onDragOver(event)}
          onDragEnd={(event) => {
            setActiveDrag(null);
            const overId = event.over ? String(event.over.id) : null;
            const kind = activeKind(event);
            if (overId && (kind === "task" || kind === "note")) {
              const dateKey = dayDropDateKey(overId);
              if (dateKey) {
                scheduleItemOnDay(String(event.active.id), dateKey);
                registry.get(kind)?.onDragCancel();
                return;
              }
              if (overId === INBOX_DROP_ID) {
                moveItemToInbox(String(event.active.id));
                registry.get(kind)?.onDragCancel();
                return;
              }
            }
            registry.get(kind)?.onDragEnd(event);
          }}
          onDragCancel={(event) => {
            setActiveDrag(null);
            registry.get(activeKind(event))?.onDragCancel();
          }}
        >
          {children}
        </DndContext>
      </ActiveDragContext.Provider>
    </DndDelegateContext.Provider>
  );
}
