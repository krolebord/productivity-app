import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useRef } from "react";

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
 * DndContext, so it lives at the shell: this is what lets a note card dragged
 * on the notes page drop onto a Today-panel calendar day in another subtree.
 */
export function AppDndProvider({ children }: { children: ReactNode }) {
  const delegateRef = useRef<DndDelegate | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const delegate = delegateRef.current;
    return delegate ? delegate.collisionDetection(args) : closestCenter(args);
  }, []);

  return (
    <DndDelegateContext.Provider value={delegateRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(event) => delegateRef.current?.onDragStart(event)}
        onDragMove={(event) => delegateRef.current?.onDragMove?.(event)}
        onDragOver={(event) => delegateRef.current?.onDragOver(event)}
        onDragEnd={(event) => delegateRef.current?.onDragEnd(event)}
        onDragCancel={() => delegateRef.current?.onDragCancel()}
      >
        {children}
      </DndContext>
    </DndDelegateContext.Provider>
  );
}
