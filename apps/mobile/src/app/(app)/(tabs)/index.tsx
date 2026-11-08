import {
  type AgendaHabit,
  type AgendaRow,
  type AgendaSection,
  type AgendaTask,
  type AgendaTaskRow,
  type DayHabitProgress,
  parseDateKey,
} from "@productivity/core/agenda";
import { type CalendarDayInfo, useAgenda } from "@productivity/core/data/agenda";
import { saveItemOrder } from "@productivity/core/data/items";
import { formatDueDateLabel } from "@productivity/core/date-time";
import { isCalendarBackedTask } from "@productivity/core/google-calendar/mapping";
import { markdownToPlainText } from "@productivity/core/note-text";
import { useReorderable } from "@productivity/core/use-reorderable";
import { useDb } from "@productivity/core/user-db/db-context";
import { differenceInCalendarDays, format } from "date-fns";
import { useRouter } from "expo-router";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Canvas, Path, Skia } from "react-native-skia";
import { useCSSVariable } from "uniwind";
import { useTabContentInset } from "../../../components/assistant-button";
import { GlobalActions } from "../../../components/global-actions";
import { type DragHandle, ReorderableList } from "../../../components/reorderable-list";
import { ScreenHeader } from "../../../components/screen-header";
import { CheckCircle } from "../../../components/ui/check-circle";
import { EmptyState } from "../../../components/ui/empty-state";
import { Icon } from "../../../components/ui/icon";
import { IconButton } from "../../../components/ui/icon-button";
import { Input } from "../../../components/ui/input";
import { confirmHabitReset } from "../../../lib/habits";
import { useCurrentDayKey } from "../../../lib/use-current-day";
import { cn } from "../../../lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type Agenda = ReturnType<typeof useAgenda>;

const isRowDone = (row: AgendaRow) => (row.kind === "task" ? row.completed : row.done);

/** Subtitle under the day title; always set, so switching days doesn't shift the layout. */
function daySubtitle(date: Date, todayKey: string) {
  const days = differenceInCalendarDays(date, parseDateKey(todayKey));
  if (days === 0) return format(date, "EEEE, MMMM d");
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

export default function TodayScreen() {
  const contentInset = useTabContentInset();
  const agenda = useAgenda(useCurrentDayKey(), { keepMonthGrid: true });
  const router = useRouter();
  const [showCompleted, setShowCompleted] = useState(false);
  const [dragging, setDragging] = useState(false);

  const headerLabel = agenda.isSelectedToday ? "Today" : format(agenda.selectedDate, "EEE, MMM d");
  const activeSections = useMemo(
    () =>
      agenda.sections.reduce<AgendaSection[]>((result, section) => {
        const rows = section.rows.filter((row) => !isRowDone(row));
        if (rows.length > 0) result.push({ ...section, rows });
        return result;
      }, []),
    [agenda.sections],
  );
  const completedRows = useMemo(() => agenda.sections.flatMap((s) => s.rows.filter(isRowDone)), [agenda.sections]);

  // The viewed day is where "Scheduled" puts an inbox task, like quick-add and the inbox's schedule action.
  const openTask = (id: string) => router.push({ pathname: "/task/[id]", params: { id, day: agenda.selectedKey } });
  // Rows get the actions rather than `agenda` (a new object every render), so the compiler can
  // skip rows whose data didn't change.
  const actions: RowActions = {
    openTask,
    toggleTaskCompleted: agenda.toggleTaskCompleted,
    moveTaskToToday: agenda.moveTaskToToday,
    toggleHabitDone: agenda.toggleHabitDone,
    incrementHabit: agenda.incrementHabit,
    completeInboxTask: agenda.completeInboxTask,
    scheduleInboxTask: agenda.scheduleInboxTask,
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={headerLabel}
        subtitle={daySubtitle(agenda.selectedDate, agenda.todayKey)}
        actions={
          <>
            <GlobalActions />
            <IconButton
              icon={agenda.calendarExpanded ? "chevron-up" : "calendar"}
              label={agenda.calendarExpanded ? "Collapse calendar" : "Expand calendar"}
              onPress={agenda.toggleCalendarExpanded}
            />
          </>
        }
      >
        <CalendarStrip agenda={agenda} />
      </ScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: contentInset }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!dragging}
      >
        <QuickAddTask selectedLabel={headerLabel} onCreate={agenda.createTask} />

        {agenda.inboxTasks.length > 0 && (
          <InboxSection tasks={agenda.inboxTasks} selectedLabel={headerLabel} actions={actions} />
        )}

        {activeSections.length === 0 && completedRows.length === 0 ? (
          <EmptyState
            icon="sun"
            title="Nothing planned"
            description="Add a task above, or set up habits to see them here."
          />
        ) : (
          <>
            {activeSections.map((section) => (
              <View key={section.bucket} className="gap-1">
                <SectionTitle label={section.label} destructive={section.bucket === "overdue"} />
                {section.bucket === "anytime" && (
                  <ReorderableTasks rows={section.rows} actions={actions} onDraggingChange={setDragging} />
                )}
                {section.rows
                  .filter((row) => section.bucket !== "anytime" || !isManuallyOrdered(row))
                  .map((row) => (
                    <AgendaRowView
                      key={`${row.kind}:${row.id}:${row.kind === "habit" ? row.dateKey : ""}`}
                      row={row}
                      overdue={section.bucket === "overdue"}
                      actions={actions}
                    />
                  ))}
              </View>
            ))}
            {completedRows.length > 0 && (
              <View className="gap-1">
                <CollapsibleSectionTitle
                  label={`Completed · ${completedRows.length}`}
                  expanded={showCompleted}
                  onToggle={() => setShowCompleted((value) => !value)}
                />
                {showCompleted &&
                  completedRows.map((row) => (
                    <AgendaRowView key={`${row.kind}:${row.id}`} row={row} overdue={false} actions={actions} />
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Untimed open tasks of a day keep the manual order set by dragging them, as on web. */
const isManuallyOrdered = (row: AgendaRow): row is AgendaTaskRow =>
  row.kind === "task" && !row.completed && !row.task.hasDueTime;

const TASK_ROW_HEIGHT = 48;

type RowActions = Pick<
  Agenda,
  | "toggleTaskCompleted"
  | "moveTaskToToday"
  | "toggleHabitDone"
  | "incrementHabit"
  | "completeInboxTask"
  | "scheduleInboxTask"
> & { openTask: (id: string) => void };

function ReorderableTasks({
  rows,
  actions,
  onDraggingChange,
}: {
  rows: readonly AgendaRow[];
  actions: RowActions;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const db = useDb();
  // The tasks themselves, not wrappers, so an unchanged task is the same object after a refresh.
  const tasks = useMemo(() => rows.filter(isManuallyOrdered).map((row) => row.task), [rows]);
  const save = useCallback((changes: { id: string; order: number }[]) => saveItemOrder(db.db, changes), [db]);
  const { items, move } = useReorderable(tasks, save);
  if (items.length === 0) return null;

  return (
    <ReorderableList
      items={items}
      rowHeight={TASK_ROW_HEIGHT}
      onMove={move}
      onDraggingChange={onDraggingChange}
      rowClassName="bg-background"
      renderItem={(task, handle) => (
        <TaskRow task={task} completed={false} overdue={false} handle={handle} actions={actions} />
      )}
    />
  );
}

function SectionTitle({ label, destructive = false }: { label: string; destructive?: boolean }) {
  return (
    <Text
      className={`py-1 font-medium text-xs uppercase tracking-wide ${destructive ? "text-destructive" : "text-muted-foreground"}`}
    >
      {label}
    </Text>
  );
}

/** Section label that toggles its rows, as used by the Inbox and Completed groups. */
function CollapsibleSectionTitle({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
      className="flex-row items-center gap-1 py-1"
    >
      <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} colorClassName="accent-muted-foreground" />
      <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</Text>
    </Pressable>
  );
}

type RingColors = { fill: string; selectedFill: string; track: string };

function CalendarStrip({ agenda }: { agenda: Agenda }) {
  const { dayInfos, calendarExpanded, selectedDate, selectedKey, todayKey } = agenda;
  const [primary, primaryForeground, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-primary-foreground",
    "--color-muted-foreground",
  ]) as (string | undefined)[];
  const ringColors: RingColors = {
    fill: primary ?? "#8b5cf6",
    selectedFill: primaryForeground ?? "#ffffff",
    track: mutedForeground ?? "#71717a",
  };
  const weeks = useMemo(() => {
    const rows: CalendarDayInfo[][] = [];
    for (let i = 0; i < dayInfos.length; i += 7) rows.push(dayInfos.slice(i, i + 7));
    return rows;
  }, [dayInfos]);

  // `dayInfos` always covers the month grid. Collapsed, only the selected day's week shows; the
  // other rows mount hidden after the next frame, so expanding shows existing cells instead of
  // creating ~35 of them on tap (which roughly halved the expand on a Pixel 7).
  const monthKey = format(selectedDate, "yyyy-MM");
  const [mountedMonth, setMountedMonth] = useState<string | null>(null);
  useEffect(() => {
    if (mountedMonth === monthKey) return;
    const frame = requestAnimationFrame(() => startTransition(() => setMountedMonth(monthKey)));
    return () => cancelAnimationFrame(frame);
  }, [mountedMonth, monthKey]);

  return (
    <View className="gap-1">
      <View className="flex-row items-center">
        <IconButton
          icon="chevron-left"
          label={calendarExpanded ? "Previous month" : "Previous week"}
          onPress={() => agenda.shiftCalendar(-1)}
          iconClassName="accent-muted-foreground"
          size={18}
          className="size-8"
        />
        <Text className="flex-1 text-center font-medium text-muted-foreground text-sm">
          {format(selectedDate, "MMMM yyyy")}
        </Text>
        <IconButton
          icon="chevron-right"
          label={calendarExpanded ? "Next month" : "Next week"}
          onPress={() => agenda.shiftCalendar(1)}
          iconClassName="accent-muted-foreground"
          size={18}
          className="size-8"
        />
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((weekday) => (
          <Text key={weekday} className="flex-1 text-center font-medium text-[11px] text-muted-foreground">
            {weekday[0]}
          </Text>
        ))}
      </View>
      {weeks.map((week) => {
        const shown = calendarExpanded || week.some((day) => day.dateKey === selectedKey);
        if (!shown && mountedMonth !== monthKey) return null;
        return (
          <View key={week[0]?.dateKey} className="flex-row" style={shown ? SHOWN_ROW : HIDDEN_ROW}>
            {week.map((day) => (
              <DayCell
                key={day.dateKey}
                day={day}
                selected={day.dateKey === selectedKey}
                isToday={day.dateKey === todayKey}
                muted={calendarExpanded && day.date.getMonth() !== selectedDate.getMonth()}
                ringColors={ringColors}
                onSelect={agenda.selectDateKey}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

// Set both ways explicitly: an unset `display` could keep a reused native view's previous value.
const SHOWN_ROW = { display: "flex" } as const;
const HIDDEN_ROW = { display: "none" } as const;

function DayCell({
  day,
  selected,
  isToday,
  muted,
  ringColors,
  onSelect,
}: {
  day: CalendarDayInfo;
  selected: boolean;
  isToday: boolean;
  muted: boolean;
  ringColors: RingColors;
  onSelect: (dateKey: string) => void;
}) {
  const progress = day.habitProgress;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${format(day.date, "EEEE, MMMM d")}${
        progress ? `, ${progress.done} of ${progress.due} habits done` : ""
      }`}
      accessibilityState={{ selected }}
      onPress={() => onSelect(day.dateKey)}
      className={`mx-0.5 flex-1 items-center gap-0.5 rounded-lg py-1 ${selected ? "bg-primary" : "active:bg-muted"} ${
        muted && !selected ? "opacity-40" : ""
      }`}
    >
      <View className="size-8 items-center justify-center">
        {progress && <HabitProgressRing progress={progress} selected={selected} colors={ringColors} />}
        <Text
          className={`font-semibold text-base ${
            selected ? "text-primary-foreground" : isToday ? "text-primary" : "text-foreground"
          }`}
        >
          {day.date.getDate()}
        </Text>
      </View>
      <View
        className={`size-1 rounded-full ${
          day.hasIncompleteTasks ? (selected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent"
        }`}
      />
    </Pressable>
  );
}

const RING_SIZE = 32;
const RING_STROKE = 2;

/** The day's habits done so far as a ring around the date, filling clockwise from the top (as on web). */
function HabitProgressRing({
  progress,
  selected,
  colors,
}: {
  progress: DayHabitProgress;
  selected: boolean;
  colors: RingColors;
}) {
  const ratio = progress.due > 0 ? Math.min(1, progress.done / progress.due) : 0;
  const { track, arc } = useMemo(() => {
    const inset = RING_STROKE / 2;
    const oval = Skia.XYWHRect(inset, inset, RING_SIZE - RING_STROKE, RING_SIZE - RING_STROKE);
    const arc = Skia.PathBuilder.Make();
    if (ratio >= 1) arc.addArc(oval, -90, 359.99);
    else if (ratio > 0) arc.addArc(oval, -90, 360 * ratio);
    return { track: Skia.Path.Oval(oval), arc: arc.detach() };
  }, [ratio]);

  return (
    <Canvas pointerEvents="none" style={{ position: "absolute", width: RING_SIZE, height: RING_SIZE }}>
      <Path
        path={track}
        style="stroke"
        strokeWidth={RING_STROKE}
        color={selected ? colors.selectedFill : colors.track}
        opacity={selected ? 0.3 : 0.25}
      />
      <Path
        path={arc}
        style="stroke"
        strokeWidth={RING_STROKE}
        strokeCap="round"
        color={selected ? colors.selectedFill : colors.fill}
      />
    </Canvas>
  );
}

function QuickAddTask({
  selectedLabel,
  onCreate,
}: {
  selectedLabel: string;
  onCreate: (title: string, scheduled: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [toInbox, setToInbox] = useState(false);

  const submit = () => {
    if (!title.trim()) return;
    onCreate(title, !toInbox);
    setTitle("");
  };

  return (
    <View className="h-12 flex-row items-center gap-2 rounded-xl border border-border bg-card pr-1 pl-3">
      <Input
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={
          toInbox
            ? "Add to inbox"
            : `Add a task for ${selectedLabel.toLowerCase() === "today" ? "today" : selectedLabel}`
        }
        className="h-full flex-1"
      />
      {/* Shows where the task goes, like the web's destination toggle. */}
      <IconButton
        icon={toInbox ? "inbox" : "calendar"}
        label={toInbox ? "Send new task to inbox" : `Schedule new task for ${selectedLabel}`}
        onPress={() => setToInbox((value) => !value)}
        iconClassName="accent-muted-foreground"
        size={18}
      />
      <IconButton
        icon="plus"
        label="Add task"
        onPress={submit}
        disabled={!title.trim()}
        iconClassName="accent-primary-foreground"
        size={18}
        className="size-9 bg-primary active:bg-primary/80"
      />
    </View>
  );
}

function InboxSection({
  tasks,
  selectedLabel,
  actions,
}: {
  tasks: AgendaTask[];
  selectedLabel: string;
  actions: RowActions;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="gap-1">
      <CollapsibleSectionTitle
        label={`Inbox · ${tasks.length}`}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
      {expanded &&
        tasks.map((task) => <InboxRow key={task.id} task={task} selectedLabel={selectedLabel} actions={actions} />)}
    </View>
  );
}

function InboxRow({ task, selectedLabel, actions }: { task: AgendaTask; selectedLabel: string; actions: RowActions }) {
  return (
    <View className="min-h-11 flex-row items-center gap-3">
      <CheckCircle
        checked={false}
        optimistic
        label={`Complete ${taskLabel(task)}`}
        onPress={() => actions.completeInboxTask(task.id, true)}
      />
      <Pressable className="flex-1 py-2" onPress={() => actions.openTask(task.id)}>
        <TaskTitle task={task} />
      </Pressable>
      <IconButton
        icon="calendar"
        label={`Schedule for ${selectedLabel}`}
        onPress={() => actions.scheduleInboxTask(task.id)}
        iconClassName="accent-muted-foreground"
        size={16}
        className="size-8"
      />
    </View>
  );
}

/** Spreads the row into fields so rows get the (stable) task or habit objects, not the wrapper. */
function AgendaRowView({ row, overdue, actions }: { row: AgendaRow; overdue: boolean; actions: RowActions }) {
  if (row.kind === "task") {
    return <TaskRow task={row.task} completed={row.completed} overdue={overdue} actions={actions} />;
  }
  return (
    <HabitRow
      habit={row.habit}
      dateKey={row.dateKey}
      value={row.value}
      dayValue={row.dayValue}
      done={row.done}
      editable={row.editable}
      overdue={overdue}
      actions={actions}
    />
  );
}

function taskLabel(task: AgendaTask) {
  return task.title.trim() || markdownToPlainText(task.content, 100) || "Untitled";
}

function TaskTitle({ task, completed = false, lines = 2 }: { task: AgendaTask; completed?: boolean; lines?: number }) {
  const hasTitle = task.title.trim().length > 0;
  return (
    <Text
      numberOfLines={lines}
      className={`text-base ${hasTitle ? "text-foreground" : "text-muted-foreground"} ${completed ? "line-through" : ""}`}
    >
      {taskLabel(task)}
    </Text>
  );
}

function TaskRow({
  task,
  completed,
  overdue,
  handle,
  actions,
}: {
  task: AgendaTask;
  completed: boolean;
  overdue: boolean;
  /** Set for rows in a reorderable list: a one-line row with a grip at the end. */
  handle?: DragHandle;
  actions: RowActions;
}) {
  const timeLabel = task.hasDueTime && task.dueAt != null ? format(task.dueAt, "HH:mm") : null;
  const dueLabel = overdue && task.dueAt != null ? formatDueDateLabel(task.dueAt, task.hasDueTime) : null;

  return (
    <View className={cn("min-h-11 flex-row items-center gap-3", handle && "h-full", completed && "opacity-60")}>
      <CheckCircle
        checked={completed}
        optimistic
        label={completed ? "Mark incomplete" : "Mark complete"}
        onPress={() => actions.toggleTaskCompleted(task, !completed)}
      />
      <Pressable className="flex-1 py-2" onPress={() => actions.openTask(task.id)}>
        <View className="flex-row items-center gap-2">
          <View className="shrink">
            <TaskTitle task={task} completed={completed} lines={handle ? 1 : 2} />
          </View>
          {isCalendarBackedTask(task) && <Icon name="calendar" size={12} colorClassName="accent-muted-foreground" />}
          {timeLabel && !overdue && (
            <Text
              className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {timeLabel}
            </Text>
          )}
        </View>
        {dueLabel && <Text className="mt-0.5 text-destructive text-xs">{dueLabel}</Text>}
      </Pressable>
      {overdue && (
        <IconButton
          icon="corner-down-left"
          label="Move to today"
          onPress={() => actions.moveTaskToToday(task)}
          iconClassName="accent-muted-foreground"
          size={16}
          className="size-8"
        />
      )}
      {handle?.(
        <View
          accessibilityLabel={`Reorder ${taskLabel(task)}`}
          accessibilityHint="Hold and drag to move"
          className="h-full justify-center pr-1 pl-2"
        >
          <Icon name="menu" size={16} colorClassName="accent-muted-foreground/60" />
        </View>,
      )}
    </View>
  );
}

function HabitRow({
  habit,
  dateKey,
  value,
  dayValue,
  done,
  editable,
  overdue,
  actions,
}: {
  habit: AgendaHabit;
  dateKey: string;
  value: number;
  dayValue: number;
  done: boolean;
  editable: boolean;
  overdue: boolean;
  actions: RowActions;
}) {
  const onToggle = (nextDone: boolean) => actions.toggleHabitDone(habit, dateKey, nextDone);
  const onIncrement = () => actions.incrementHabit(habit.id, dateKey, dayValue);
  const isSimple = habit.target <= 1;
  const unit = habit.unit.trim();
  const progressLabel = `${value}/${habit.target}${unit ? ` ${unit}` : ""}`;
  const missedLabel = overdue ? format(parseDateKey(dateKey), "MMM d") : null;

  return (
    <View className={`min-h-11 flex-row items-center gap-3 ${done ? "opacity-60" : ""}`}>
      <CheckCircle
        checked={done}
        disabled={!editable}
        // Increments and confirmed resets don't flip `done` on every press.
        optimistic={isSimple && !done}
        label={done ? `Uncheck ${habit.name}` : isSimple ? `Complete ${habit.name}` : `Add 1 to ${habit.name}`}
        onPress={() =>
          done ? confirmHabitReset(habit, value, () => onToggle(false)) : isSimple ? onToggle(true) : onIncrement()
        }
      />
      <View className="flex-1 py-2">
        <View className="flex-row items-center gap-2">
          <Icon name="repeat" size={12} colorClassName="accent-muted-foreground" />
          <Text numberOfLines={1} className={`shrink text-base text-foreground ${done ? "line-through" : ""}`}>
            {habit.name}
          </Text>
        </View>
        {missedLabel && <Text className="mt-0.5 text-destructive text-xs">{missedLabel}</Text>}
        {!isSimple && <Text className="text-muted-foreground text-xs">{progressLabel}</Text>}
      </View>
      {!isSimple && editable && !done && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add 1 to ${habit.name}`}
          onPress={onIncrement}
          className="h-8 flex-row items-center gap-1 rounded-full border border-border px-3 active:bg-muted"
        >
          <Icon name="plus" size={14} colorClassName="accent-foreground" />
          <Text className="font-medium text-foreground text-sm">1</Text>
        </Pressable>
      )}
    </View>
  );
}
