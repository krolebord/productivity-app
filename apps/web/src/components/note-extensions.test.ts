import { MarkdownManager } from "@tiptap/markdown";
import { Node } from "@tiptap/pm/model";
import { getSchema } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { noteExtensions, parseNoteMarkdown } from "./note-extensions";

const schema = getSchema(noteExtensions);
const manager = new MarkdownManager({ extensions: noteExtensions, markedOptions: { gfm: true } });

/** What the editor saves for a note it opened without changes: parse, build the PM doc, serialize. */
function roundTrip(markdown: string) {
  const doc = Node.fromJSON(schema, parseNoteMarkdown(markdown));
  return manager.serialize(doc.toJSON());
}

describe("note markdown round-trip", () => {
  it.each([
    ["table", "| Name  | Qty |\n| ----- | --- |\n| apple | 2   |\n| pear  | 10  |"],
    ["aligned table", "| Name  | Qty |\n| :---- | --: |\n| apple | 2   |"],
    ["text around a table", "Before\n\n| A   | B   |\n| --- | --- |\n| 1   | 2   |\n\nAfter"],
    ["task list", "- [ ] todo\n- [x] done\n  - [ ] nested"],
    ["headings with blank lines", "# Title\n\nText\n\n## Sub\n\nMore"],
    ["headings without blank lines", "# Title\nText\n## Sub\n- item"],
    ["mixed heading spacing", "# Title\n\nText\n## Sub\n\n```\ncode\n```"],
    ["code block", "```ts\nconst a = 1;\n```"],
    ["inline marks", "Some **bold**, *italic* and `code`."],
    ["ordered list", "1. one\n2. two"],
    ["blockquote", "> quote"],
  ])("keeps a %s unchanged", (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps table cell content when normalizing column widths", () => {
    const out = roundTrip("| A | B |\n|---|---|\n| long cell | `x` |");
    expect(out).toBe("| A         | B   |\n| --------- | --- |\n| long cell | `x` |");
    expect(roundTrip(out)).toBe(out);
  });

  it("doesn't tighten blocks around a heading added in the editor", () => {
    const doc = parseNoteMarkdown("Text\n\nMore");
    doc.content?.splice(1, 0, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "New" }] });
    expect(manager.serialize(Node.fromJSON(schema, doc).toJSON())).toBe("Text\n\n## New\n\nMore");
  });

  it("doesn't save the editor's trailing empty paragraph", () => {
    const doc = parseNoteMarkdown("- [ ] todo");
    doc.content?.push({ type: "paragraph" });
    expect(manager.serialize(Node.fromJSON(schema, doc).toJSON())).toBe("- [ ] todo");
  });

  it("keeps line breaks in table cells", () => {
    const markdown = "| A        |\n| -------- |\n| one<br>two |";
    const cell = parseNoteMarkdown(markdown).content?.[0].content?.[1].content?.[0].content?.[0];
    expect(cell?.content?.map((node) => node.type)).toEqual(["text", "hardBreak", "text"]);
    const out = roundTrip(markdown);
    expect(out).toContain("one<br>two");
    expect(roundTrip(out)).toBe(out);
  });

  it.each([
    ["inline code", "| A          |\n| ---------- |\n| `a<br>b`   |", "`a<br>b`"],
    ["escaped HTML", "| A          |\n| ---------- |\n| a&lt;br&gt;b |", "a&lt;br&gt;b"],
  ])("doesn't turn <br> in %s in a cell into a line break", (_name, markdown, cellText) => {
    const cell = parseNoteMarkdown(markdown).content?.[0].content?.[1].content?.[0].content?.[0];
    expect(cell?.content?.map((node) => node.type)).toEqual(["text"]);
    const out = roundTrip(markdown);
    expect(out).toContain(cellText);
    expect(roundTrip(out)).toBe(out);
  });

  it("parses a table into editable cells", () => {
    const doc = parseNoteMarkdown("| A | B |\n|---|---|\n| 1 | 2 |");
    const table = doc.content?.[0];
    expect(table?.type).toBe("table");
    expect(table?.content?.map((row) => row.content?.map((cell) => cell.type))).toEqual([
      ["tableHeader", "tableHeader"],
      ["tableCell", "tableCell"],
    ]);
  });
});
