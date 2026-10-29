import { describe, expect, it } from "vitest";
import { filterTagCounts, filterTagOptions, matchesTagFilter, type TagFilter } from "./note-filter";
import { addTags, UNTAGGED } from "./tags";

const note = (...tags: string[]) => ({ tags: JSON.stringify(tags) });
const notes = [note("work", "urgent"), note("work"), note("home"), note()];

describe("matchesTagFilter", () => {
  it("matches all or any of the included tags", () => {
    const all: TagFilter = { include: ["work", "urgent"], exclude: [], match: "all" };
    expect(notes.filter((n) => matchesTagFilter(n, all))).toEqual([notes[0]]);
    expect(notes.filter((n) => matchesTagFilter(n, { ...all, include: ["urgent", "home"], match: "any" }))).toEqual([
      notes[0],
      notes[2],
    ]);
  });

  it("lets excluded tags win and matches untagged notes", () => {
    const filter: TagFilter = { include: ["work", UNTAGGED], exclude: ["urgent"], match: "any" };
    expect(notes.filter((n) => matchesTagFilter(n, filter))).toEqual([notes[1], notes[3]]);
  });
});

describe("filter tag options", () => {
  it("lists tags alphabetically with untagged last, keeping active filters", () => {
    expect(filterTagOptions(notes, { include: ["gone"], exclude: [] })).toEqual([
      "gone",
      "home",
      "urgent",
      "work",
      UNTAGGED,
    ]);
  });

  it("counts what each option would show or hide", () => {
    const tags = ["home", "urgent", "work", UNTAGGED];
    const counts = (filter: TagFilter) => Object.fromEntries(filterTagCounts(notes, filter, tags));
    expect(counts({ include: [], exclude: [], match: "all" })).toEqual({ home: 1, urgent: 1, work: 2, [UNTAGGED]: 1 });
    expect(counts({ include: ["work"], exclude: ["urgent"], match: "all" })).toEqual({
      home: 0,
      urgent: 1,
      work: 1,
      [UNTAGGED]: 0,
    });
    expect(counts({ include: ["work", "home"], exclude: [], match: "any" })).toEqual({
      home: 1,
      urgent: 1,
      work: 2,
      [UNTAGGED]: 1,
    });
  });
});

describe("addTags", () => {
  it("normalizes comma-separated text and skips duplicates", () => {
    expect(addTags(["work"], " Side Project, #work,, home ")).toEqual(["work", "side-project", "home"]);
    expect(addTags(["work"], "  ")).toEqual(["work"]);
  });
});
