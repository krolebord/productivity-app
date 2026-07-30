import { closestCenter, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";
import { useDndDelegate } from "@/components/app-dnd";
import type { AgendaRow, AgendaSection, AgendaTask, AgendaTaskRow } from "@/lib/agenda";
import { useDb } from "@/user-db/user-db";

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const next = array.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Incomplete untimed tasks whose agenda position is driven by `item.order`. */
function untimedIncompleteTasks(section: AgendaSection): AgendaTaskRow[] {
  if (section.bucket !== "anytime" && section.bucket !== "overdue") return [];
  return section.rows.filter(
    (row): row is AgendaTaskRow => row.kind === "task" && !row.completed && !row.task.hasDueTime,
  );
}

function reorderGroupForTask(
  taskId: string,
  inboxTasks: readonly AgendaTask[],
  sections: readonly AgendaSection[],
): { key: string; ids: string[] } | null {
  if (inboxTasks.some((task) => task.id === taskId)) {
    return { key: "inbox", ids: inboxTasks.map((task) => task.id) };
  }
  for (const section of sections) {
    const tasks = untimedIncompleteTasks(section);
    if (tasks.some((task) => task.id === taskId)) {
      return { key: `untimed:${section.bucket}`, ids: tasks.map((task) => task.id) };
    }
  }
  return null;
}

function applyOrderedIds(rows: AgendaRow[], orderedIds: string[]): AgendaRow[] {
  const idSet = new Set(orderedIds);
  const queue = orderedIds.flatMap((id) => {
    const row = rows.find((r) => r.kind === "task" && r.id === id);
    return row ? [row] : [];
  });
  let i = 0;
  return rows.map((row) => {
    if (row.kind === "task" && idSet.has(row.id)) return queue[i++] ?? row;
    return row;
  });
}

function midOrder(prev: number | undefined, next: number | undefined): number | null {
  if (typeof prev === "number" && typeof next === "number") {
    const mid = (prev + next) / 2;
    return mid > prev && mid < next ? mid : null;
  }
  if (typeof prev === "number" && next === undefined) return prev + 1;
  if (typeof next === "number" && prev === undefined) return next - 1;
  return null;
}

/**
 * List reorder for inbox + untimed anytime/overdue tasks. Calendar day drops
 * stay in AppDndProvider; this only runs when the drop target is another task.
 */
export function useTaskReorder(inboxTasks: AgendaTask[], sections: AgendaSection[]) {
  const db = useDb();
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null);

  const displayedInboxTasks = useMemo(() => {
    if (dragGroupKey !== "inbox" || !dragIds) return inboxTasks;
    const byId = new Map(inboxTasks.map((task) => [task.id, task]));
    const ordered = dragIds.flatMap((id) => {
      const task = byId.get(id);
      return task ? [task] : [];
    });
    if (ordered.length < inboxTasks.length) {
      const seen = new Set(dragIds);
      ordered.push(...inboxTasks.filter((task) => !seen.has(task.id)));
    }
    return ordered;
  }, [inboxTasks, dragIds, dragGroupKey]);

  const displayedSections = useMemo(() => {
    if (!dragGroupKey?.startsWith("untimed:") || !dragIds) return sections;
    const bucket = dragGroupKey.slice("untimed:".length);
    return sections.map((section) => {
      if (section.bucket !== bucket) return section;
      return { ...section, rows: applyOrderedIds(section.rows, dragIds) };
    });
  }, [sections, dragIds, dragGroupKey]);

  const finishDrag = useCallback(() => {
    setDragIds(null);
    setDragGroupKey(null);
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const group = reorderGroupForTask(String(event.active.id), inboxTasks, sections);
      if (!group) {
        finishDrag();
        return;
      }
      setDragGroupKey(group.key);
      setDragIds(group.ids);
    },
    [inboxTasks, sections, finishDrag],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || over.id === active.id || !dragIds || !dragGroupKey) return;

      const overId = String(over.id);
      if (!dragIds.includes(overId)) return;

      setDragIds((ids) => {
        if (!ids) return ids;
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(overId);
        if (from === -1 || to === -1 || from === to) return ids;
        return arrayMove(ids, from, to);
      });
    },
    [dragIds, dragGroupKey],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const finalIds = dragIds;
      const groupKey = dragGroupKey;
      finishDrag();
      if (!finalIds || !groupKey) return;

      const orderById = new Map<string, number>();
      if (groupKey === "inbox") {
        for (const task of inboxTasks) orderById.set(task.id, task.order ?? 0);
      } else {
        const bucket = groupKey.slice("untimed:".length);
        const section = sections.find((s) => s.bucket === bucket);
        if (!section) return;
        for (const row of untimedIncompleteTasks(section)) {
          orderById.set(row.id, row.task.order ?? 0);
        }
      }

      const ordered = finalIds.flatMap((id) => {
        const order = orderById.get(id);
        return order === undefined ? [] : [{ id, order }];
      });
      if (ordered.length !== finalIds.length) return;

      let baseline: string[];
      if (groupKey === "inbox") {
        baseline = inboxTasks.map((task) => task.id);
      } else {
        const bucket = groupKey.slice("untimed:".length);
        const section = sections.find((s) => s.bucket === bucket);
        if (!section) return;
        baseline = untimedIncompleteTasks(section).map((row) => row.id);
      }
      if (ordered.every((item, i) => item.id === baseline[i])) return;

      const movedId = String(event.active.id);
      const movedIndex = ordered.findIndex((item) => item.id === movedId);
      if (movedIndex === -1) return;

      const prevOrder = movedIndex > 0 ? ordered[movedIndex - 1].order : undefined;
      const nextOrder = movedIndex < ordered.length - 1 ? ordered[movedIndex + 1].order : undefined;
      const movedOrder = midOrder(prevOrder, nextOrder);

      if (movedOrder !== null) {
        db.db.executeKysely((q) => q.updateTable("item").set({ order: movedOrder }).where("id", "=", movedId));
      } else {
        db.db.executeTransaction((trx) => {
          ordered.forEach((item, i) => {
            trx.executeKysely((q) =>
              q
                .updateTable("item")
                .set({ order: i + 1 })
                .where("id", "=", item.id),
            );
          });
        });
      }
    },
    [dragIds, dragGroupKey, inboxTasks, sections, finishDrag, db],
  );

  useDndDelegate("task", {
    collisionDetection: closestCenter,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: finishDrag,
  });

  return { displayedInboxTasks, displayedSections };
}
