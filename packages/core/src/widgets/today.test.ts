import { describe, expect, it } from "vitest";
import type { AgendaHabit, AgendaTask } from "../agenda";
import { zonedTimeMs } from "../time-zone";
import { createWidgetLinker } from "./snapshots";
import { buildTodayWidgetSnapshot } from "./today";

const zone = "America/New_York";
const at = (day: string, hour: number) => zonedTimeMs(day, hour, 0, zone);
const ctx = { now: at("2026-11-09", 15), timeZone: zone, link: createWidgetLinker("productivity") };
const task = (id: string, dueAt: number | null, completedAt: number | null = null): AgendaTask => ({
  id,
  title: id,
  content: "",
  dueAt,
  hasDueTime: false,
  completedAt,
  order: 0,
  providerType: null,
});
const habit: AgendaHabit = {
  id: "habit",
  name: "Habit",
  scheduleType: "daily",
  scheduleInterval: 1,
  scheduleWeekdays: [],
  scheduleMonthDays: [],
  timeOfDay: null,
  target: 1,
  unit: "",
  order: 0,
  archivedAt: null,
  createdAt: at("2026-11-09", 0),
};

describe("Today widget", () => {
  it("uses Today order, includes inbox and habits, and caps all unfinished rows together", () => {
    const inputs = {
      inbox: [task("inbox", null)],
      habits: [habit],
      tasks: [
        task("overdue", at("2026-11-08", 12)),
        ...Array.from({ length: 10 }, (_, i) => task(`task${i}`, at("2026-11-09", 12))),
        task("done", at("2026-11-09", 12), ctx.now),
      ],
    };
    const [today, tomorrow] = buildTodayWidgetSnapshot(inputs, ctx).days;
    expect(today.rows.map((row) => row.id)).toEqual([
      "inbox",
      "overdue",
      "task0",
      "task1",
      "task2",
      "task3",
      "task4",
      "task5",
      "task6",
      "task7",
    ]);
    expect([today.remaining, today.done, today.total]).toEqual([13, 1, 14]);
    expect(tomorrow.startsAt).toBe(at("2026-11-10", 0));
    const [habitDay] = buildTodayWidgetSnapshot({ tasks: [], habits: [habit] }, ctx).days;
    expect(habitDay.rows[0]?.kind).toBe("habit");
    expect(habitDay.rows[0]?.url).toContain("today");
  });
  it("mixes habits into page sections and only hides a counted habit once its target is reached", () => {
    const water = { ...habit, id: "water", name: "Water", target: 3, timeOfDay: "morning" as const };
    const inputs = {
      tasks: [{ ...task("meeting", at("2026-11-09", 9)), hasDueTime: true }, task("manual", at("2026-11-09", 0))],
      habits: [water, habit],
      entriesByHabit: new Map([
        [water.id, new Map([["2026-11-09", 2]])],
        [habit.id, new Map([["2026-11-09", 1]])],
      ]),
    };
    const [today, tomorrow] = buildTodayWidgetSnapshot(inputs, ctx).days;
    expect(today.rows.map((row) => row.title)).toEqual(["meeting", "Water", "manual"]);
    expect([today.remaining, today.done, today.total]).toEqual([3, 1, 4]);
    expect(tomorrow.rows.filter((row) => row.kind === "habit").map((row) => row.title)).toEqual(["Water", "Habit"]);
    inputs.entriesByHabit.get(water.id)?.set("2026-11-09", 3);
    const completed = buildTodayWidgetSnapshot(inputs, ctx).days[0];
    expect(completed.rows.map((row) => row.title)).toEqual(["meeting", "manual"]);
    expect([completed.remaining, completed.done, completed.total]).toEqual([2, 2, 4]);
  });
});
