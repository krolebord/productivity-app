import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, PlusIcon, Repeat } from "lucide-react";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseScheduleMonthDays,
  parseScheduleWeekdays,
  useCreateHabit,
  useHabitDialogStore,
} from "@/components/habit-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { habitTargetPeriodLabel } from "@/lib/agenda";
import { cn } from "@/lib/utils";
import type { HabitItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/habits")({
  component: HabitsPage,
});

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

const TIME_OF_DAY_LABELS: Record<NonNullable<HabitItem["timeOfDay"]>, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

function ordinal(n: number) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatHabitSchedule(
  habit: Pick<HabitItem, "scheduleType" | "scheduleInterval" | "scheduleWeekdays" | "scheduleMonthDays">,
) {
  switch (habit.scheduleType) {
    case "daily":
      return "Every day";
    case "weekly":
      return "Once a week";
    case "monthly":
      return "Once a month";
    case "everyNDays": {
      const n = habit.scheduleInterval;
      return n === 1 ? "Every day" : `Every ${n} days`;
    }
    case "weekdays": {
      const days = parseScheduleWeekdays(habit.scheduleWeekdays);
      if (days.length === 0) return "No days selected";
      return days.map((d) => WEEKDAY_LABELS[d] ?? String(d)).join(", ");
    }
    case "monthDays": {
      const days = parseScheduleMonthDays(habit.scheduleMonthDays);
      if (days.length === 0) return "No days selected";
      return `${days.map(ordinal).join(", ")} of each month`;
    }
    default:
      return "Custom";
  }
}

export function formatHabitTarget(habit: Pick<HabitItem, "target" | "unit" | "scheduleType">) {
  if (habit.target <= 1) return null;
  const unit = habit.unit.trim();
  const period = habitTargetPeriodLabel(habit.scheduleType);
  if (unit) return `${habit.target} ${unit}/${period}`;
  return `×${habit.target}/${period}`;
}

function sortHabits(habits: HabitItem[]) {
  return [...habits].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });
}

function HabitCardContent({
  habit,
  muted = false,
  dragProps,
}: {
  habit: HabitItem;
  muted?: boolean;
  dragProps?: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    justDraggedRef: MutableRefObject<boolean>;
  };
}) {
  const openEdit = useHabitDialogStore((s) => s.openEdit);
  const schedule = formatHabitSchedule(habit);
  const target = formatHabitTarget(habit);
  const timeLabel = habit.timeOfDay ? TIME_OF_DAY_LABELS[habit.timeOfDay] : null;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full touch-manipulation flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-left text-card-foreground shadow-xs transition-colors hover:bg-accent/40",
        muted && "opacity-70",
      )}
      {...(dragProps ? { ...dragProps.attributes, ...dragProps.listeners } : {})}
      onClick={() => {
        if (dragProps?.justDraggedRef.current) return;
        openEdit(habit.id);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate font-medium text-sm">{habit.name || "Untitled"}</span>
        {timeLabel && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
            {timeLabel}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
        <span>{schedule}</span>
        {target && (
          <>
            <span aria-hidden className="text-border">
              ·
            </span>
            <span>{target}</span>
          </>
        )}
      </div>
    </button>
  );
}

function SortableHabitCard({ habit }: { habit: HabitItem }) {
  const sortable = useSortable({ id: habit.id });
  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  };

  const justDraggedRef = useRef(false);
  useEffect(() => {
    if (sortable.isDragging) {
      justDraggedRef.current = true;
    } else if (justDraggedRef.current) {
      const timeout = setTimeout(() => {
        justDraggedRef.current = false;
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [sortable.isDragging]);

  return (
    <div ref={sortable.setNodeRef} style={style} className={cn("group", sortable.isDragging && "z-10 opacity-50")}>
      <HabitCardContent
        habit={habit}
        dragProps={{
          attributes: sortable.attributes,
          listeners: sortable.listeners,
          justDraggedRef,
        }}
      />
    </div>
  );
}

function HabitsPage() {
  const db = useDb();
  const createHabit = useCreateHabit();

  const { data: list } = useDbQuery((q) => q.selectFrom("habit").selectAll().orderBy("order", "asc"), {
    mapData: (habits) => ({ habits: sortHabits(habits), timestamp: Date.now() }),
  });

  const [optimisticList, _setOptimisticList] = useState<typeof list>(list);
  const setOptimisticHabits = useCallback((habits: (typeof list)["habits"]) => {
    _setOptimisticList({ habits, timestamp: Date.now() });
  }, []);
  const habits = list.timestamp > optimisticList.timestamp ? list.habits : optimisticList.habits;

  const activeHabits = useMemo(() => habits.filter((h) => h.archivedAt == null), [habits]);
  const archivedHabits = useMemo(() => habits.filter((h) => h.archivedAt != null), [habits]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = activeHabits.findIndex((h) => h.id === active.id);
    const to = activeHabits.findIndex((h) => h.id === over.id);
    if (from === -1 || to === -1) return;

    const ordered = arrayMove(activeHabits, from, to);
    const movedId = String(active.id);
    const movedIndex = to;

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

    const nextActive =
      movedOrder !== null
        ? ordered.map((h) => (h.id === movedId ? { ...h, order: movedOrder } : h))
        : ordered.map((h, i) => ({ ...h, order: i + 1 }));

    setOptimisticHabits([...nextActive, ...archivedHabits]);

    if (movedOrder !== null) {
      const order = movedOrder;
      db.db.executeKysely((q) =>
        q.updateTable("habit").set({ order, updatedAt: Date.now() }).where("id", "=", movedId),
      );
    } else {
      db.db.executeTransaction((trx) => {
        const now = Date.now();
        ordered.forEach((h, i) => {
          trx.executeKysely((q) =>
            q
              .updateTable("habit")
              .set({ order: i + 1, updatedAt: now })
              .where("id", "=", h.id),
          );
        });
      });
    }
  }

  return (
    <div className="@container px-4 py-4 sm:px-6 sm:py-6">
      <div className="@xl:mb-6 mb-4 flex @xl:flex-row flex-col @xl:items-center @xl:justify-between gap-3">
        <h1 className="font-semibold text-xl">Habits</h1>
        <Button onClick={createHabit} size="sm">
          <PlusIcon />
          New habit
        </Button>
      </div>

      {activeHabits.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <Repeat className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No habits yet</p>
            <p className="text-muted-foreground text-sm">Create one to start building a routine.</p>
          </div>
          <Button onClick={createHabit} variant="outline">
            <PlusIcon />
            New habit
          </Button>
        </div>
      )}

      {activeHabits.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activeHabits.map((h) => h.id)} strategy={rectSortingStrategy}>
            <div className="grid @4xl:grid-cols-3 @md:grid-cols-2 grid-cols-1 gap-3">
              {activeHabits.map((habit) => (
                <SortableHabitCard key={habit.id} habit={habit} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {archivedHabits.length > 0 && (
        <Collapsible className="mt-8">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground">
            <ChevronDown className="size-3.5 transition-transform [[data-closed]_&]:-rotate-90" />
            Archived ({archivedHabits.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="grid @4xl:grid-cols-3 @md:grid-cols-2 grid-cols-1 gap-3">
              {archivedHabits.map((habit) => (
                <HabitCardContent key={habit.id} habit={habit} muted />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
