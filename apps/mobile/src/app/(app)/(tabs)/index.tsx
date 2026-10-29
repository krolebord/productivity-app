import {
  type AgendaHabit,
  type AgendaHabitRow,
  type AgendaRow,
  type AgendaSection,
  type AgendaTask,
  type AgendaTaskRow,
  parseDateKey,
} from "@productivity/core/agenda";
import { type CalendarDayInfo, useAgenda } from "@productivity/core/data/agenda";
import { formatDueDateLabel } from "@productivity/core/date-time";
import { isCalendarBackedTask } from "@productivity/core/google-calendar/mapping";
import { markdownToPlainText } from "@productivity/core/note-text";
import { differenceInCalendarDays, format } from "date-fns";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTabContentInset } from "../../../components/assistant-button";
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
  const agenda = useAgenda(useCurrentDayKey());
  const router = useRouter();
  const [showCompleted, setShowCompleted] = useState(false);

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

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={headerLabel}
        subtitle={daySubtitle(agenda.selectedDate, agenda.todayKey)}
        actions={
          <>
            {/* Hidden rather than removed on today, so the title keeps its width. */}
            <Pressable
              accessibilityRole="button"
              accessibilityElementsHidden={agenda.isSelectedToday}
              importantForAccessibility={agenda.isSelectedToday ? "no-hide-descendants" : "auto"}
              disabled={agenda.isSelectedToday}
              onPress={agenda.goToToday}
              className={cn(
                "h-8 justify-center rounded-full border border-border px-3 active:bg-muted",
                agenda.isSelectedToday && "opacity-0",
              )}
            >
              <Text className="font-medium text-foreground text-sm">Today</Text>
            </Pressable>
            <IconButton
              icon={agenda.calendarExpanded ? "chevron-up" : "calendar"}
              label={agenda.calendarExpanded ? "Collapse calendar" : "Expand calendar"}
              onPress={agenda.toggleCalendarExpanded}
              iconClassName="accent-muted-foreground"
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
      >
        <QuickAddTask selectedLabel={headerLabel} onCreate={agenda.createTask} />

        {agenda.inboxTasks.length > 0 && (
          <InboxSection tasks={agenda.inboxTasks} selectedLabel={headerLabel} agenda={agenda} onOpen={openTask} />
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
                {section.rows.map((row) => (
                  <AgendaRowView
                    key={`${row.kind}:${row.id}:${row.kind === "habit" ? row.dateKey : ""}`}
                    row={row}
                    overdue={section.bucket === "overdue"}
                    agenda={agenda}
                    onOpenTask={openTask}
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
                    <AgendaRowView
                      key={`${row.kind}:${row.id}`}
                      row={row}
                      overdue={false}
                      agenda={agenda}
                      onOpenTask={openTask}
                    />
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
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

function CalendarStrip({ agenda }: { agenda: Agenda }) {
  const { dayInfos, calendarExpanded, selectedDate, selectedKey, todayKey } = agenda;
  const weeks = useMemo(() => {
    const rows: CalendarDayInfo[][] = [];
    for (let i = 0; i < dayInfos.length; i += 7) rows.push(dayInfos.slice(i, i + 7));
    return rows;
  }, [dayInfos]);

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
      {weeks.map((week) => (
        <View key={week[0]?.dateKey} className="flex-row">
          {week.map((day) => (
            <DayCell
              key={day.dateKey}
              day={day}
              selected={day.dateKey === selectedKey}
              isToday={day.dateKey === todayKey}
              muted={calendarExpanded && day.date.getMonth() !== selectedDate.getMonth()}
              onSelect={agenda.selectDateKey}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayCell({
  day,
  selected,
  isToday,
  muted,
  onSelect,
}: {
  day: CalendarDayInfo;
  selected: boolean;
  isToday: boolean;
  muted: boolean;
  onSelect: (dateKey: string) => void;
}) {
  const progress = day.habitProgress;
  const allHabitsDone = progress != null && progress.done >= progress.due;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={format(day.date, "EEEE, MMMM d")}
      accessibilityState={{ selected }}
      onPress={() => onSelect(day.dateKey)}
      className={`mx-0.5 flex-1 items-center gap-1 rounded-lg py-1.5 ${selected ? "bg-primary" : "active:bg-muted"} ${
        muted && !selected ? "opacity-40" : ""
      }`}
    >
      <Text
        className={`font-semibold text-base ${
          selected ? "text-primary-foreground" : isToday ? "text-primary" : "text-foreground"
        }`}
      >
        {day.date.getDate()}
      </Text>
      <View className="h-1 flex-row gap-0.5">
        {day.hasIncompleteTasks && (
          <View className={`size-1 rounded-full ${selected ? "bg-primary-foreground" : "bg-primary"}`} />
        )}
        {progress && (
          <View
            className={`size-1 rounded-full ${
              allHabitsDone ? "bg-emerald-500" : selected ? "bg-primary-foreground/50" : "bg-muted-foreground/40"
            }`}
          />
        )}
      </View>
    </Pressable>
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
      <Icon name="plus" size={18} colorClassName="accent-muted-foreground" />
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
      <IconButton
        icon="inbox"
        label={toInbox ? "Schedule on the selected day instead" : "Send to inbox instead"}
        onPress={() => setToInbox((value) => !value)}
        iconClassName={toInbox ? "accent-primary" : "accent-muted-foreground"}
        size={18}
        className={toInbox ? "bg-accent" : ""}
      />
    </View>
  );
}

function InboxSection({
  tasks,
  selectedLabel,
  agenda,
  onOpen,
}: {
  tasks: AgendaTask[];
  selectedLabel: string;
  agenda: Agenda;
  onOpen: (id: string) => void;
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
        tasks.map((task) => (
          <View key={task.id} className="min-h-11 flex-row items-center gap-3">
            <CheckCircle
              checked={false}
              label={`Complete ${taskLabel(task)}`}
              onPress={() => agenda.completeInboxTask(task.id, true)}
            />
            <Pressable className="flex-1 py-2" onPress={() => onOpen(task.id)}>
              <TaskTitle task={task} />
            </Pressable>
            <IconButton
              icon="calendar"
              label={`Schedule for ${selectedLabel}`}
              onPress={() => agenda.scheduleInboxTask(task.id)}
              iconClassName="accent-muted-foreground"
              size={16}
              className="size-8"
            />
          </View>
        ))}
    </View>
  );
}

function AgendaRowView({
  row,
  overdue,
  agenda,
  onOpenTask,
}: {
  row: AgendaRow;
  overdue: boolean;
  agenda: Agenda;
  onOpenTask: (id: string) => void;
}) {
  if (row.kind === "task") {
    return (
      <TaskRow
        row={row}
        overdue={overdue}
        onOpen={() => onOpenTask(row.id)}
        onToggle={(completed) => agenda.toggleTaskCompleted(row.id, completed)}
        onMoveToToday={() => agenda.moveTaskToToday(row.task)}
      />
    );
  }
  return (
    <HabitRow
      row={row}
      overdue={overdue}
      onToggle={(habit, done) => agenda.toggleHabitDone(habit, row.dateKey, done)}
      onIncrement={() => agenda.incrementHabit(row.id, row.dateKey, row.dayValue)}
    />
  );
}

function taskLabel(task: AgendaTask) {
  return task.title.trim() || markdownToPlainText(task.content, 100) || "Untitled";
}

function TaskTitle({ task, completed = false }: { task: AgendaTask; completed?: boolean }) {
  const hasTitle = task.title.trim().length > 0;
  return (
    <Text
      numberOfLines={2}
      className={`text-base ${hasTitle ? "text-foreground" : "text-muted-foreground"} ${completed ? "line-through" : ""}`}
    >
      {taskLabel(task)}
    </Text>
  );
}

function TaskRow({
  row,
  overdue,
  onOpen,
  onToggle,
  onMoveToToday,
}: {
  row: AgendaTaskRow;
  overdue: boolean;
  onOpen: () => void;
  onToggle: (completed: boolean) => void;
  onMoveToToday: () => void;
}) {
  const { task, completed } = row;
  const timeLabel = task.hasDueTime && task.dueAt != null ? format(task.dueAt, "HH:mm") : null;
  const dueLabel = overdue && task.dueAt != null ? formatDueDateLabel(task.dueAt, task.hasDueTime) : null;

  return (
    <View className={`min-h-11 flex-row items-center gap-3 ${completed ? "opacity-60" : ""}`}>
      <CheckCircle
        checked={completed}
        label={completed ? "Mark incomplete" : "Mark complete"}
        onPress={() => onToggle(!completed)}
      />
      <Pressable className="flex-1 py-2" onPress={onOpen}>
        <View className="flex-row items-center gap-2">
          <View className="shrink">
            <TaskTitle task={task} completed={completed} />
          </View>
          {isCalendarBackedTask(task) && <Icon name="calendar" size={12} colorClassName="accent-muted-foreground" />}
          {timeLabel && !overdue && <Text className="text-muted-foreground text-sm">{timeLabel}</Text>}
        </View>
        {dueLabel && <Text className="mt-0.5 text-destructive text-xs">{dueLabel}</Text>}
      </Pressable>
      {overdue && (
        <IconButton
          icon="corner-down-left"
          label="Move to today"
          onPress={onMoveToToday}
          iconClassName="accent-muted-foreground"
          size={16}
          className="size-8"
        />
      )}
    </View>
  );
}

function HabitRow({
  row,
  overdue,
  onToggle,
  onIncrement,
}: {
  row: AgendaHabitRow;
  overdue: boolean;
  onToggle: (habit: AgendaHabit, done: boolean) => void;
  onIncrement: () => void;
}) {
  const { habit, value, done, editable } = row;
  const isSimple = habit.target <= 1;
  const unit = habit.unit.trim();
  const progressLabel = `${value}/${habit.target}${unit ? ` ${unit}` : ""}`;
  const missedLabel = overdue ? format(parseDateKey(row.dateKey), "MMM d") : null;

  return (
    <View className={`min-h-11 flex-row items-center gap-3 ${done ? "opacity-60" : ""}`}>
      <CheckCircle
        checked={done}
        disabled={!editable}
        label={done ? `Uncheck ${habit.name}` : isSimple ? `Complete ${habit.name}` : `Add 1 to ${habit.name}`}
        onPress={() =>
          done
            ? confirmHabitReset(habit, value, () => onToggle(habit, false))
            : isSimple
              ? onToggle(habit, true)
              : onIncrement()
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
