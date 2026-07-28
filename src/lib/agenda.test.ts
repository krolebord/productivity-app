import { describe, expect, it } from "vitest";
import {
  type AgendaHabit,
  buildAgendaSections,
  getDayHabitProgress,
  isHabitDueOnDay,
  taskBucket,
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

    it("always shows on today, even once done earlier in the week", () => {
      expect(isHabitDueOnDay(h, "2026-07-09", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-09", today, entries(["2026-07-08", 1]))).toBe(true);
    });

    it("shows on future days until the week is complete", () => {
      expect(isHabitDueOnDay(h, "2026-07-10", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-10", today, entries(["2026-07-08", 1]))).toBe(false);
      // Next week is unaffected by this week's completion.
      expect(isHabitDueOnDay(h, "2026-07-13", today, entries(["2026-07-08", 1]))).toBe(true);
    });

    it("past incomplete week shows only on Sunday", () => {
      // Week of Jun 29 – Jul 5, no completion
      expect(isHabitDueOnDay(h, "2026-07-03", today, undefined)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-05", today, undefined)).toBe(true);
    });

    it("past completed week shows only on days with logged entries", () => {
      const e = entries(["2026-07-02", 1]);
      expect(isHabitDueOnDay(h, "2026-07-02", today, e)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-05", today, e)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-01", today, e)).toBe(false);
    });

    it("target accumulates across the week", () => {
      const h3 = habit({ id: "wk3", scheduleType: "weekly", target: 3 });
      // Week of Jun 29 – Jul 5: 1+1+1 across three days completes the week.
      const done = entries(["2026-06-29", 1], ["2026-07-01", 1], ["2026-07-03", 1]);
      expect(isHabitDueOnDay(h3, "2026-07-05", today, done)).toBe(false); // not missed on Sunday
      expect(isHabitDueOnDay(h3, "2026-07-01", today, done)).toBe(true); // contribution day shows
      expect(isHabitDueOnDay(h3, "2026-06-30", today, done)).toBe(false); // no entry that day

      // Only 2/3 logged: still missed on Sunday, partial days still show.
      const partial = entries(["2026-06-29", 1], ["2026-07-01", 1]);
      expect(isHabitDueOnDay(h3, "2026-07-05", today, partial)).toBe(true);
      expect(isHabitDueOnDay(h3, "2026-07-01", today, partial)).toBe(true);

      // Current week complete via sum: hidden on future days, still shown today.
      const thisWeek = entries(["2026-07-06", 2], ["2026-07-08", 1]);
      expect(isHabitDueOnDay(h3, "2026-07-09", today, thisWeek)).toBe(true);
      expect(isHabitDueOnDay(h3, "2026-07-10", today, thisWeek)).toBe(false);
    });
  });

  describe("monthly", () => {
    const h = habit({ id: "mo", scheduleType: "monthly" });

    it("always shows on today, even once done earlier in the month", () => {
      expect(isHabitDueOnDay(h, "2026-07-09", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-02", today, entries(["2026-07-02", 1]))).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-09", today, entries(["2026-07-02", 1]))).toBe(true);
    });

    it("shows on future days until the month is complete", () => {
      expect(isHabitDueOnDay(h, "2026-07-20", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-20", today, entries(["2026-07-02", 1]))).toBe(false);
      // Next month is unaffected by this month's completion.
      expect(isHabitDueOnDay(h, "2026-08-03", today, entries(["2026-07-02", 1]))).toBe(true);
    });

    it("past incomplete month shows only on its last day", () => {
      expect(isHabitDueOnDay(h, "2026-06-15", today, undefined)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-06-30", today, undefined)).toBe(true);
    });

    it("past completed month shows only on days with logged entries", () => {
      const e = entries(["2026-06-11", 1]);
      expect(isHabitDueOnDay(h, "2026-06-11", today, e)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-06-30", today, e)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-06-10", today, e)).toBe(false);
    });

    it("target accumulates across the month", () => {
      const h3 = habit({ id: "mo3", scheduleType: "monthly", target: 3 });
      // June: 1+1+1 across three days completes the month.
      const done = entries(["2026-06-02", 1], ["2026-06-14", 1], ["2026-06-25", 1]);
      expect(isHabitDueOnDay(h3, "2026-06-30", today, done)).toBe(false); // not missed on the last day
      expect(isHabitDueOnDay(h3, "2026-06-14", today, done)).toBe(true); // contribution day shows
      expect(isHabitDueOnDay(h3, "2026-06-15", today, done)).toBe(false); // no entry that day

      // Only 2/3 logged: still missed on the last day.
      const partial = entries(["2026-06-02", 1], ["2026-06-14", 1]);
      expect(isHabitDueOnDay(h3, "2026-06-30", today, partial)).toBe(true);

      // Current month complete via sum: hidden on future days, still shown today.
      const thisMonth = entries(["2026-07-01", 2], ["2026-07-08", 1]);
      expect(isHabitDueOnDay(h3, "2026-07-09", today, thisMonth)).toBe(true);
      expect(isHabitDueOnDay(h3, "2026-07-20", today, thisMonth)).toBe(false);
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

describe("taskBucket", () => {
  it("maps hours to buckets and all-day to anytime", () => {
    expect(taskBucket({ dueAt: new Date(2026, 6, 9, 9).getTime(), hasDueTime: true })).toBe("morning");
    expect(taskBucket({ dueAt: new Date(2026, 6, 9, 14).getTime(), hasDueTime: true })).toBe("afternoon");
    expect(taskBucket({ dueAt: new Date(2026, 6, 9, 19).getTime(), hasDueTime: true })).toBe("evening");
    expect(taskBucket({ dueAt: new Date(2026, 6, 9, 22).getTime(), hasDueTime: true })).toBe("night");
    expect(taskBucket({ dueAt: new Date(2026, 6, 9, 3).getTime(), hasDueTime: true })).toBe("night");
    expect(taskBucket({ dueAt: new Date(2026, 6, 9).getTime(), hasDueTime: false })).toBe("anytime");
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

  it("counts weekly habits done from the week's summed value", () => {
    const today = "2026-07-09"; // Thursday
    const habits = [habit({ id: "wk", scheduleType: "weekly", target: 3 })];
    const entriesByHabit = new Map([["wk", entries(["2026-07-06", 2], ["2026-07-08", 1])]]);
    expect(getDayHabitProgress(habits, today, today, entriesByHabit)).toEqual({ due: 1, done: 1 });
  });
});

describe("buildAgendaSections", () => {
  it("puts overdue tasks only on today and buckets the rest", () => {
    const today = "2026-07-09";
    const tasks = [
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
    const habits = [
      habit({ id: "h1", scheduleType: "daily", timeOfDay: "afternoon", order: 1 }),
      habit({ id: "h2", scheduleType: "daily", timeOfDay: "evening", order: 1 }),
    ];

    const sections = buildAgendaSections({
      selectedKey: today,
      todayKey: today,
      tasks,
      habits,
      entriesByHabit: new Map(),
    });

    expect(sections.map((s) => s.bucket)).toEqual(["overdue", "morning", "afternoon", "anytime", "evening"]);
    expect(sections[0]?.rows[0]?.id).toBe("over");
    expect(sections.find((s) => s.bucket === "morning")?.rows[0]?.id).toBe("today-am");
    expect(sections.find((s) => s.bucket === "anytime")?.rows[0]?.id).toBe("allday");
  });

  it("hides overdue on non-today days and marks future habits non-editable", () => {
    const today = "2026-07-09";
    const tasks = [
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
      tasks,
      habits,
      entriesByHabit: new Map(),
    });

    expect(sections.some((s) => s.bucket === "overdue")).toBe(false);
    const habitRow = sections.flatMap((s) => s.rows).find((r) => r.kind === "habit");
    expect(habitRow?.kind === "habit" && habitRow.editable).toBe(false);
  });

  it("carries week-sum progress and per-day value for weekly habits", () => {
    const today = "2026-07-09"; // Thursday
    const habits = [habit({ id: "wk", scheduleType: "weekly", target: 3 })];
    const sections = buildAgendaSections({
      selectedKey: today,
      todayKey: today,
      tasks: [],
      habits,
      entriesByHabit: new Map([["wk", entries(["2026-07-06", 1], ["2026-07-09", 1])]]),
    });
    const row = sections.flatMap((s) => s.rows).find((r) => r.kind === "habit");
    expect(row?.kind === "habit" && row.value).toBe(2);
    expect(row?.kind === "habit" && row.dayValue).toBe(1);
    expect(row?.kind === "habit" && row.done).toBe(false);
  });

  it("carries month-sum progress and per-day value for monthly habits", () => {
    const today = "2026-07-09";
    const habits = [habit({ id: "mo", scheduleType: "monthly", target: 3 })];
    const sections = buildAgendaSections({
      selectedKey: today,
      todayKey: today,
      tasks: [],
      habits,
      entriesByHabit: new Map([["mo", entries(["2026-07-01", 1], ["2026-07-09", 1])]]),
    });
    const row = sections.flatMap((s) => s.rows).find((r) => r.kind === "habit");
    expect(row?.kind === "habit" && row.value).toBe(2);
    expect(row?.kind === "habit" && row.dayValue).toBe(1);
    expect(row?.kind === "habit" && row.done).toBe(false);
  });

  it("sorts completed rows to the bottom of a section", () => {
    const today = "2026-07-09";
    const tasks = [
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
      tasks,
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
