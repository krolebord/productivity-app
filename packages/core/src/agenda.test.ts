import { describe, expect, it } from "vitest";
import {
  type AgendaHabit,
  buildAgendaSections,
  compareHabits,
  getDayHabitProgress,
  getOverdueHabitOccurrence,
  isHabitDueOnDay,
  taskBucket,
  toDateKey,
} from "./agenda";

function habit(partial: Partial<AgendaHabit> & Pick<AgendaHabit, "id" | "scheduleType">): AgendaHabit {
  return {
    name: partial.name ?? partial.id,
    scheduleInterval: partial.scheduleInterval ?? 1,
    scheduleWeekdays: partial.scheduleWeekdays ?? [],
    scheduleMonthDays: partial.scheduleMonthDays ?? [],
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
  const today = "2026-07-09";

  it("daily is due every day", () => {
    const h = habit({ id: "d", scheduleType: "daily" });
    expect(isHabitDueOnDay(h, "2026-07-09", today, undefined)).toBe(true);
    expect(isHabitDueOnDay(h, "2026-07-12", today, undefined)).toBe(true);
  });

  it("weekdays respects scheduleWeekdays", () => {
    const h = habit({ id: "w", scheduleType: "weekdays", scheduleWeekdays: [1, 3, 5] });
    expect(isHabitDueOnDay(h, "2026-07-06", today, undefined)).toBe(true);
    expect(isHabitDueOnDay(h, "2026-07-07", today, undefined)).toBe(false);
    expect(isHabitDueOnDay(h, "2026-07-08", today, undefined)).toBe(true);
  });

  describe("monthDays", () => {
    it("is due only on the selected days of month", () => {
      const h = habit({ id: "md", scheduleType: "monthDays", scheduleMonthDays: [1, 25] });
      expect(isHabitDueOnDay(h, "2026-07-01", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-25", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-24", today, undefined)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-08-25", today, undefined)).toBe(true);
    });

    it("clamps days past the end of a short month onto its last day", () => {
      const h = habit({ id: "md31", scheduleType: "monthDays", scheduleMonthDays: [31] });
      // February 2026 has 28 days; April has 30.
      expect(isHabitDueOnDay(h, "2026-02-28", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-02-27", today, undefined)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-04-30", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-31", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-30", today, undefined)).toBe(false);
    });

    it("clamps onto February 29 in a leap year", () => {
      const h = habit({ id: "md30", scheduleType: "monthDays", scheduleMonthDays: [30] });
      expect(isHabitDueOnDay(h, "2028-02-29", today, undefined)).toBe(true);
      expect(isHabitDueOnDay(h, "2028-02-28", today, undefined)).toBe(false);
    });

    it("fires once when a clamped day collides with another selected day", () => {
      const h = habit({ id: "md-collide", scheduleType: "monthDays", scheduleMonthDays: [28, 31] });
      expect(isHabitDueOnDay(h, "2026-02-28", today, undefined)).toBe(true);
      const sections = buildAgendaSections({
        selectedKey: "2026-02-28",
        todayKey: today,
        tasks: [],
        habits: [h],
        entriesByHabit: new Map(),
      });
      expect(sections.flatMap((s) => s.rows)).toHaveLength(1);
    });

    it("is not due when no days are selected", () => {
      const h = habit({ id: "md-empty", scheduleType: "monthDays", scheduleMonthDays: [] });
      expect(isHabitDueOnDay(h, "2026-07-25", today, undefined)).toBe(false);
    });
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
      expect(isHabitDueOnDay(h, "2026-07-13", today, entries(["2026-07-08", 1]))).toBe(true);
    });

    it("past incomplete week shows only on Sunday", () => {
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
      const done = entries(["2026-06-29", 1], ["2026-07-01", 1], ["2026-07-03", 1]);
      expect(isHabitDueOnDay(h3, "2026-07-05", today, done)).toBe(false);
      expect(isHabitDueOnDay(h3, "2026-07-01", today, done)).toBe(true);
      expect(isHabitDueOnDay(h3, "2026-06-30", today, done)).toBe(false);

      const partial = entries(["2026-06-29", 1], ["2026-07-01", 1]);
      expect(isHabitDueOnDay(h3, "2026-07-05", today, partial)).toBe(true);
      expect(isHabitDueOnDay(h3, "2026-07-01", today, partial)).toBe(true);

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
      const done = entries(["2026-06-02", 1], ["2026-06-14", 1], ["2026-06-25", 1]);
      expect(isHabitDueOnDay(h3, "2026-06-30", today, done)).toBe(false);
      expect(isHabitDueOnDay(h3, "2026-06-14", today, done)).toBe(true);
      expect(isHabitDueOnDay(h3, "2026-06-15", today, done)).toBe(false);

      const partial = entries(["2026-06-02", 1], ["2026-06-14", 1]);
      expect(isHabitDueOnDay(h3, "2026-06-30", today, partial)).toBe(true);

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
        createdAt: new Date(2026, 6, 6).getTime(),
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
      expect(isHabitDueOnDay(h, "2026-07-08", today, e)).toBe(false);
      expect(isHabitDueOnDay(h, "2026-07-09", today, e)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-10", today, e)).toBe(true);

      const done = entries(["2026-07-06", 1], ["2026-07-09", 1]);
      expect(isHabitDueOnDay(h, "2026-07-09", today, done)).toBe(true);
      expect(isHabitDueOnDay(h, "2026-07-10", today, done)).toBe(false);
    });
  });
});

describe("getOverdueHabitOccurrence", () => {
  // 2026-07-06 is a Monday, so 2026-07-09 is a Thursday.
  describe("weekdays", () => {
    const h = habit({ id: "w", scheduleType: "weekdays", scheduleWeekdays: [1, 3, 5] });

    it("carries the last missed weekday", () => {
      expect(getOverdueHabitOccurrence(h, "2026-07-09", undefined)).toBe("2026-07-08");
    });

    it("clears once that day is completed", () => {
      expect(getOverdueHabitOccurrence(h, "2026-07-09", entries(["2026-07-08", 1]))).toBeNull();
    });

    it("is superseded on days the habit is due again", () => {
      expect(getOverdueHabitOccurrence(h, "2026-07-08", undefined)).toBeNull();
      // Friday's own row replaces Wednesday's miss, even with Wednesday unfinished.
      expect(getOverdueHabitOccurrence(h, "2026-07-10", undefined)).toBeNull();
    });

    it("looks no further back than the previous occurrence", () => {
      // Monday and Wednesday both missed; only Wednesday is still outstanding.
      expect(getOverdueHabitOccurrence(h, "2026-07-09", entries(["2026-07-06", 1]))).toBe("2026-07-08");
    });

    it("is not overdue when no weekdays are selected", () => {
      const none = habit({ id: "w-empty", scheduleType: "weekdays", scheduleWeekdays: [] });
      expect(getOverdueHabitOccurrence(none, "2026-07-09", undefined)).toBeNull();
    });
  });

  describe("monthDays", () => {
    const h = habit({ id: "md", scheduleType: "monthDays", scheduleMonthDays: [1] });

    it("stays overdue for the rest of the month", () => {
      expect(getOverdueHabitOccurrence(h, "2026-07-09", undefined)).toBe("2026-07-01");
      expect(getOverdueHabitOccurrence(h, "2026-07-31", undefined)).toBe("2026-07-01");
    });

    it("clears once that day is completed", () => {
      expect(getOverdueHabitOccurrence(h, "2026-07-09", entries(["2026-07-01", 1]))).toBeNull();
    });

    it("stays overdue while progress falls short of the target", () => {
      const h3 = habit({ id: "md3", scheduleType: "monthDays", scheduleMonthDays: [1], target: 3 });
      expect(getOverdueHabitOccurrence(h3, "2026-07-09", entries(["2026-07-01", 2]))).toBe("2026-07-01");
      expect(getOverdueHabitOccurrence(h3, "2026-07-09", entries(["2026-07-01", 3]))).toBeNull();
    });

    it("hands over to the next month's occurrence", () => {
      expect(getOverdueHabitOccurrence(h, "2026-08-01", undefined)).toBeNull();
      // July's miss is gone; August 1 is now the outstanding one.
      expect(getOverdueHabitOccurrence(h, "2026-08-02", undefined)).toBe("2026-08-01");
    });

    it("carries a day clamped onto the end of a short month", () => {
      const h31 = habit({
        id: "md31",
        scheduleType: "monthDays",
        scheduleMonthDays: [31],
        createdAt: new Date(2025, 11, 1).getTime(),
      });
      expect(getOverdueHabitOccurrence(h31, "2026-03-01", undefined)).toBe("2026-02-28");
      expect(getOverdueHabitOccurrence(h31, "2026-03-30", undefined)).toBe("2026-02-28");
      expect(getOverdueHabitOccurrence(h31, "2026-03-31", undefined)).toBeNull();
    });
  });

  it("ignores occurrences from before the habit existed", () => {
    const h = habit({
      id: "md-new",
      scheduleType: "monthDays",
      scheduleMonthDays: [1],
      createdAt: new Date(2026, 6, 3).getTime(),
    });
    expect(getOverdueHabitOccurrence(h, "2026-07-09", undefined)).toBeNull();
  });

  it("ignores archived habits", () => {
    const h = habit({
      id: "w-archived",
      scheduleType: "weekdays",
      scheduleWeekdays: [1, 3, 5],
      archivedAt: new Date(2026, 6, 9).getTime(),
    });
    expect(getOverdueHabitOccurrence(h, "2026-07-09", undefined)).toBeNull();
  });

  it("leaves schedules that already carry themselves alone", () => {
    const today = "2026-07-09";
    expect(getOverdueHabitOccurrence(habit({ id: "d", scheduleType: "daily" }), today, undefined)).toBeNull();
    expect(getOverdueHabitOccurrence(habit({ id: "wk", scheduleType: "weekly" }), today, undefined)).toBeNull();
    expect(getOverdueHabitOccurrence(habit({ id: "mo", scheduleType: "monthly" }), today, undefined)).toBeNull();
    expect(
      getOverdueHabitOccurrence(habit({ id: "n", scheduleType: "everyNDays", scheduleInterval: 3 }), today, undefined),
    ).toBeNull();
  });
});

describe("compareHabits", () => {
  it("orders by manual order, then creation time, then id", () => {
    const habits = [
      habit({ id: "c", scheduleType: "daily", order: 1, createdAt: 5 }),
      habit({ id: "b", scheduleType: "daily", order: 1, createdAt: 3 }),
      habit({ id: "a", scheduleType: "daily", order: 1, createdAt: 3 }),
      habit({ id: "z", scheduleType: "daily", order: 0, createdAt: 9 }),
    ];
    expect([...habits].sort(compareHabits).map((h) => h.id)).toEqual(["z", "a", "b", "c"]);
  });

  it("ignores names, so renaming a habit doesn't move it", () => {
    const first = habit({ id: "1", name: "Zebra", scheduleType: "daily", createdAt: 1 });
    const second = habit({ id: "2", name: "Apple", scheduleType: "daily", createdAt: 2 });
    expect([second, first].sort(compareHabits).map((h) => h.id)).toEqual(["1", "2"]);
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
      habit({ id: "b", scheduleType: "weekdays", scheduleWeekdays: [1] }),
      habit({ id: "c", scheduleType: "daily", target: 10 }),
    ];
    const entriesByHabit = new Map([
      ["a", entries(["2026-07-09", 1])],
      ["c", entries(["2026-07-09", 4])],
    ]);
    expect(getDayHabitProgress(habits, today, today, entriesByHabit)).toEqual({ due: 2, done: 1 });
  });

  it("counts weekly habits done from the week's summed value", () => {
    const today = "2026-07-09";
    const habits = [habit({ id: "wk", scheduleType: "weekly", target: 3 })];
    const entriesByHabit = new Map([["wk", entries(["2026-07-06", 2], ["2026-07-08", 1])]]);
    expect(getDayHabitProgress(habits, today, today, entriesByHabit)).toEqual({ due: 1, done: 1 });
  });
});

describe("buildAgendaSections", () => {
  it("reads task times in the given zone instead of the runtime's", () => {
    // 21:30 UTC on Aug 3 is 00:30 on Aug 4 in Kyiv and 17:30 on Aug 3 in New York.
    const dueAt = Date.parse("2026-08-03T21:30:00Z");
    const tasks = [
      { id: "t", title: "Late", content: "", dueAt, hasDueTime: true, completedAt: null, order: 0, providerType: null },
    ];
    const sectionsFor = (selectedKey: string, timeZone: string) =>
      buildAgendaSections({
        selectedKey,
        todayKey: "2026-08-01",
        tasks,
        habits: [],
        entriesByHabit: new Map(),
        timeZone,
      }).map((section) => [section.bucket, section.rows.map((row) => row.id)]);

    expect(sectionsFor("2026-08-04", "Europe/Kyiv")).toEqual([["night", ["t"]]]);
    expect(sectionsFor("2026-08-03", "Europe/Kyiv")).toEqual([]);
    expect(sectionsFor("2026-08-03", "America/New_York")).toEqual([["evening", ["t"]]]);
  });

  it("marks tasks before midnight of today in the given zone as overdue", () => {
    // 22:00 UTC on Aug 3 is already Aug 4 in Kyiv, so it is not overdue on Kyiv's Aug 4.
    const tasks = [
      {
        id: "t",
        title: "Edge",
        content: "",
        dueAt: Date.parse("2026-08-03T22:00:00Z"),
        hasDueTime: false,
        completedAt: null,
        order: 0,
        providerType: null,
      },
    ];
    const overdueIds = (timeZone: string) =>
      buildAgendaSections({
        selectedKey: "2026-08-04",
        todayKey: "2026-08-04",
        tasks,
        habits: [],
        entriesByHabit: new Map(),
        timeZone,
      })
        .filter((section) => section.bucket === "overdue")
        .flatMap((section) => section.rows.map((row) => row.id));

    expect(overdueIds("Europe/Kyiv")).toEqual([]);
    expect(overdueIds("America/New_York")).toEqual(["t"]);
  });

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
        providerType: null,
      },
      {
        id: "today-am",
        title: "Call",
        content: "",
        dueAt: new Date(2026, 6, 9, 9).getTime(),
        hasDueTime: true,
        completedAt: null,
        order: 2,
        providerType: null,
      },
      {
        id: "allday",
        title: "Errand",
        content: "",
        dueAt: new Date(2026, 6, 9).getTime(),
        hasDueTime: false,
        completedAt: null,
        order: 3,
        providerType: null,
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
        providerType: null,
      },
      {
        id: "fri",
        title: "Fri",
        content: "",
        dueAt: new Date(2026, 6, 10).getTime(),
        hasDueTime: false,
        completedAt: null,
        order: 2,
        providerType: null,
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
    const today = "2026-07-09";
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

  it("puts a missed habit occurrence in overdue, pinned to the day it was due", () => {
    const today = "2026-07-09";
    const habits = [habit({ id: "w", scheduleType: "weekdays", scheduleWeekdays: [1, 3, 5], target: 3 })];
    const sections = buildAgendaSections({
      selectedKey: today,
      todayKey: today,
      tasks: [],
      habits,
      entriesByHabit: new Map([["w", entries(["2026-07-08", 1])]]),
    });

    const overdue = sections.find((s) => s.bucket === "overdue");
    const row = overdue?.rows[0];
    expect(row?.kind === "habit" && row.habit.id).toBe("w");
    expect(row?.kind === "habit" && row.dateKey).toBe("2026-07-08");
    expect(row?.kind === "habit" && row.value).toBe(1);
    expect(row?.kind === "habit" && row.done).toBe(false);
    // Past days stay editable, so the miss can be recorded where it belongs.
    expect(row?.kind === "habit" && row.editable).toBe(true);
  });

  it("shows a missed habit occurrence only on today", () => {
    const today = "2026-07-09";
    const habits = [habit({ id: "w", scheduleType: "weekdays", scheduleWeekdays: [1, 3, 5] })];
    for (const selectedKey of ["2026-07-07", "2026-07-10"]) {
      const sections = buildAgendaSections({
        selectedKey,
        todayKey: today,
        tasks: [],
        habits,
        entriesByHabit: new Map(),
      });
      expect(sections.some((s) => s.bucket === "overdue")).toBe(false);
    }
  });

  it("keeps a carried-over miss out of the day's habit progress", () => {
    const today = "2026-07-09";
    const habits = [habit({ id: "w", scheduleType: "weekdays", scheduleWeekdays: [1, 3, 5] })];
    // Thursday is not a scheduled day, so its ring must stay empty.
    expect(getDayHabitProgress(habits, today, today, new Map())).toEqual({ due: 0, done: 0 });
  });

  it("sorts overdue habits after overdue tasks", () => {
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
        providerType: null,
      },
    ];
    const habits = [habit({ id: "w", scheduleType: "weekdays", scheduleWeekdays: [1, 3, 5] })];
    const sections = buildAgendaSections({
      selectedKey: today,
      todayKey: today,
      tasks,
      habits,
      entriesByHabit: new Map(),
    });
    expect(sections.find((s) => s.bucket === "overdue")?.rows.map((r) => r.id)).toEqual(["over", "w"]);
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
        providerType: null,
      },
      {
        id: "open",
        title: "Open",
        content: "",
        dueAt: new Date(2026, 6, 9, 10).getTime(),
        hasDueTime: true,
        completedAt: null,
        order: 2,
        providerType: null,
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
