import { describe, expect, it } from "vitest";
import {
  type AgendaHabit,
  buildAgendaSections,
  getDayHabitProgress,
  isHabitDueOnDay,
  noteBucket,
  toDateKey,
} from "./agenda";

function habit(partial: Partial<AgendaHabit> & Pick<AgendaHabit, "id" | "scheduleType">): AgendaHabit {
  return {
    name: partial.name ?? partial.id,
    scheduleInterval: partial.scheduleInterval ?? 1,
    scheduleWeekdays: partial.scheduleWeekdays ?? [],
    timeOfDay: partial.timeOfDay ?? null,
    target: partial.target ?? 1,
    unit: partial.unit ?? "",
    order: partial.order ?? 0,
    archivedAt: partial.archivedAt ?? null,
    createdAt: partial.createdAt ?? new Date(2026, 6, 1).getTime(),
    ...partial,
  };
}

function entries(...pairs: Array<[string, number]>): Map<string, number> {
  return new Map(pairs);
}

describe("isHabitDueOnDay", () => {
  const today = "2026-07-09"; // Thursday

  it("daily is due every day", () => {
    const h = habit({ id: "d", scheduleType: "daily" });
    expect(isHabitDueOnDay(h, "2026-07-09", today, undefined)).toBe(true);
    expect(isHabitDueOnDay(h, "2026-07-12", today, undefined)).toBe(true);
  });

  it("weekdays respects scheduleWeekdays", () => {
    const h = habit({ id: "w", scheduleType: "weekdays", scheduleWeekdays: [1, 3, 5] });
    expect(isHabitDueOnDay(h, "2026-07-06", today, undefined)).toBe(true); // Mon
    expect(isHabitDueOnDay(h, "2026-07-07", today, undefined)).toBe(false); // Tue
    expect(isHabitDueOnDay(h, "2026-07-08", today, undefined)).toBe(true); // Wed
  });

  it("hides habits from the archive day onward unless recorded that day", () => {
    const h = habit({
      id: "a",
      scheduleType: "daily",
      archivedAt: new Date(2026, 6, 8, 15).getTime(),
    });
    expect(isHabitDueOnDay(h, "2026-07-07", today, undefined)).toBe(true);
    expect(isHabitDueOnDay(h, "2026-07-08", today, undefined)).toBe(false);
    expect(isHabitDueOnDay(h, "2026-07-08", today, entries(["2026-07-08", 1]))).toBe(true);
    expect(isHabitDueOnDay(h, "2026-07-09", today, undefined)).toBe(false);
  });

  describe("weekly", () => {
    const h = habit({ id: "wk", scheduleType: "weekly" });

    it("shows on today/future until done that week", () => {
      expect(isHabitDueOnDay(h, "2026-07-09", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-10", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-09", today, entries(["2026-07-08", 1]))).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-08", today, entries(["2026-07-08", 1]))).toBe(true);
    });

    it("past incomplete week shows only on Sunday", () => {
      // Week of Jun 29 – Jul 5, no completion
      expect(isHabitDueOnDay(h, "2026-07-03", today, undefined)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-05", today, undefined)).toBe(true);
    });

    it("past completed week shows only on the completion day", () => {
      const e = entries(["2026-07-02", 1]);
      expect(isHabitDueOnDay(h, "2026-07-02", today, e)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-05", today, e)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-01", today, e)).toBe(false);
    });
  });

  describe("everyNDays", () => {
    it("is due from createdAt day when never completed", () => {
      const h = habit({
        id: "n",
        scheduleType: "everyNDays",
        scheduleInterval: 3,
        createdAt: new Date(2026, 6, 6).getTime(), // Jul 6
      });
      expect(isHabitDueOnDay(h, "2026-07-05", today, undefined)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-06", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-09", today, undefined)).toBe(true);
    });

    it("is due N days after last completion and shown until done", () => {
      const h = habit({
        id: "n",
        scheduleType: "everyNDays",
        scheduleInterval: 3,
        createdAt: new Date(2026, 6, 1).getTime(),
      });
      const e = entries(["2026-07-06", 1]);
      // due = Jul 9
      expect(isHabitDueOnDay(h, "2026-07-08", today, e)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-09", today, e)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-10", today, e)).toBe(true);

      const done = entries(["2026-07-06", 1], ["2026-07-09", 1]);
      expect(isHabitDueOnDay(h, "2026-07-09", today, done)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-10", today, done)).toBe(false);
    });
  });
});

describe("noteBucket", () => {
  it("maps hours to buckets and all-day to anytime", () => {
    expect(noteBucket({ dueAt: new Date(2026, 6, 9, 9).getTime(), hasDueTime: true })).toBe("morning");
    expect(noteBucket({ dueAt: new Date(2026, 6, 9, 14).getTime(), hasDueTime: true })).toBe("afternoon");
    expect(noteBucket({ dueAt: new Date(2026, 6, 9, 19).getTime(), hasDueTime: true })).toBe("evening");
    expect(noteBucket({ dueAt: new Date(2026, 6, 9, 22).getTime(), hasDueTime: true })).toBe("night");
    expect(noteBucket({ dueAt: new Date(2026, 6, 9, 3).getTime(), hasDueTime: true })).toBe("night");
    expect(noteBucket({ dueAt: new Date(2026, 6, 9).getTime(), hasDueTime: false })).toBe("anytime");
  });
});

describe("getDayHabitProgress", () => {
  it("counts due and done habits for a day", () => {
    const today = "2026-07-09";
    const habits = [
      habit({ id: "a", scheduleType: "daily" }),
      habit({ id: "b", scheduleType: "weekdays", scheduleWeekdays: [1] }), // Mon only
      habit({ id: "c", scheduleType: "daily", target: 10 }),
    ];
    const entriesByHabit = new Map([
      ["a", entries(["2026-07-09", 1])],
      ["c", entries(["2026-07-09", 4])],
    ]);
    expect(getDayHabitProgress(habits, today, today, entriesByHabit)).toEqual({ due: 2, done: 1 });
  });
});

describe("buildAgendaSections", () => {
  it("puts overdue notes only on today and buckets the rest", () => {
    const today = "2026-07-09";
    const notes = [
      {
        id: "over",
        title: "Old",
        content: "",
        dueAt: new Date(2026, 6, 7, 10).getTime(),
        hasDueTime: true,
        completedAt: null,
        order: 1,
      },
      {
        id: "today-am",
        title: "Call",
        content: "",
        dueAt: new Date(2026, 6, 9, 9).getTime(),
        hasDueTime: true,
        completedAt: null,
        order: 2,
      },
      {
        id: "allday",
        title: "Errand",
        content: "",
        dueAt: new Date(2026, 6, 9).getTime(),
        hasDueTime: false,
        completedAt: null,
        order: 3,
      },
    ];
    const habits = [habit({ id: "h1", scheduleType: "daily", timeOfDay: "evening", order: 1 })];

    const sections = buildAgendaSections({
      selectedKey: today,
      todayKey: today,
      notes,
      habits,
      entriesByHabit: new Map(),
    });

    expect(sections.map((s) => s.bucket)).toEqual(["overdue", "anytime", "morning", "evening"]);
    expect(sections[0]?.rows[0]?.id).toBe("over");
    expect(sections.find((s) => s.bucket === "morning")?.rows[0]?.id).toBe("today-am");
    expect(sections.find((s) => s.bucket === "anytime")?.rows[0]?.id).toBe("allday");
  });

  it("hides overdue on non-today days and marks future habits non-editable", () => {
    const today = "2026-07-09";
    const notes = [
      {
        id: "over",
        title: "Old",
        content: "",
        dueAt: new Date(2026, 6, 7, 10).getTime(),
        hasDueTime: true,
        completedAt: null,
        order: 1,
      },
      {
        id: "fri",
        title: "Fri",
        content: "",
        dueAt: new Date(2026, 6, 10).getTime(),
        hasDueTime: false,
        completedAt: null,
        order: 2,
      },
    ];
    const habits = [habit({ id: "h1", scheduleType: "daily" })];
    const sections = buildAgendaSections({
      selectedKey: "2026-07-10",
      todayKey: today,
      notes,
      habits,
      entriesByHabit: new Map(),
    });

    expect(sections.some((s) => s.bucket === "overdue")).toBe(false);
    const habitRow = sections.flatMap((s) => s.rows).find((r) => r.kind === "habit");
    expect(habitRow?.kind === "habit" && habitRow.editable).toBe(false);
  });

  it("sorts completed rows to the bottom of a section", () => {
    const today = "2026-07-09";
    const notes = [
      {
        id: "done",
        title: "Done",
        content: "",
        dueAt: new Date(2026, 6, 9, 8).getTime(),
        hasDueTime: true,
        completedAt: Date.now(),
        order: 1,
      },
      {
        id: "open",
        title: "Open",
        content: "",
        dueAt: new Date(2026, 6, 9, 10).getTime(),
        hasDueTime: true,
        completedAt: null,
        order: 2,
      },
    ];
    const sections = buildAgendaSections({
      selectedKey: today,
      todayKey: today,
      notes,
      habits: [],
      entriesByHabit: new Map(),
    });
    const morning = sections.find((s) => s.bucket === "morning");
    expect(morning?.rows.map((r) => r.id)).toEqual(["open", "done"]);
  });
});

describe("toDateKey", () => {
  it("formats local calendar days", () => {
    expect(toDateKey(new Date(2026, 6, 9, 23, 30))).toBe("2026-07-09");
  });
});
