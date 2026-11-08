import { describe, expect, it } from "vitest";
import {
  type ChecklistBlock,
  compactRichBlocks,
  insertChecklistAfter,
  insertChecklistItem,
  isRichEditable,
  itemText,
  moveOpenChecklistItem,
  parseNoteBlocks,
  removeChecklistItem,
  replaceNoteBlock,
  separateRichBlocks,
  serializeNoteBlocks,
  setChecklistItemText,
  toggleChecklistItem,
} from "./note-blocks";

const roundTrip = (markdown: string) => serializeNoteBlocks(parseNoteBlocks(markdown));
const kinds = (markdown: string) => parseNoteBlocks(markdown).map((block) => block.kind);
const checklist = (markdown: string) => parseNoteBlocks(markdown).find((b) => b.kind === "checklist") as ChecklistBlock;
const texts = (block: ChecklistBlock) => block.items.map(itemText);

describe("parseNoteBlocks / serializeNoteBlocks", () => {
  it.each([
    "",
    "\n",
    "Hello",
    "Hello\n",
    "# Title\n\nSome **bold** text\n\n- [ ] one\n- [x] two\n\nAfter\n",
    "- [ ] a\n  - [X] nested\n* [ ]  odd spacing\n1. [ ] numbered\n",
    "- [ ]\n- [ ] \n-\t[x]\ttab",
    "```\n- [ ] in code\n```\n- [ ] real",
    "> - [ ] quoted\n- [ ] real",
    "- [ ] item\n  continued paragraph\n",
    "\n\n- [ ] a\n\n\n- [ ] b\n\n",
    "Text\r\n- [ ] crlf\r\n",
  ])("round-trips %j exactly", (markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("splits text and checklist runs", () => {
    expect(kinds("Intro\n- [ ] a\n- [x] b\n\nOutro")).toEqual(["text", "checklist", "text"]);
    expect(kinds("- [ ] a\n\n- [ ] b")).toEqual(["checklist", "text", "checklist"]);
    expect(kinds("")).toEqual(["text"]);
  });

  it("leaves tasks in code, quotes and items with continuations as text", () => {
    expect(kinds("```\n- [ ] x\n```")).toEqual(["text"]);
    expect(kinds("> - [ ] x")).toEqual(["text"]);
    expect(kinds("- [ ] x\n  more")).toEqual(["text"]);
  });

  it("keeps blank lines around text out of its body", () => {
    const [block] = parseNoteBlocks("\nHello\n\n");
    expect(block).toMatchObject({ kind: "text", lead: [""], body: "Hello", trail: ["", ""] });
  });
});

describe("checklist edits", () => {
  const md = "- [ ] a\n- [x] done\n- [ ] b\n- [ ] c";

  it("sinks a checked item to the end and lifts an unchecked one above checked items", () => {
    const block = checklist(md);
    const checkedA = toggleChecklistItem(block, block.items[0].id);
    expect(serializeNoteBlocks([checkedA])).toBe("- [ ] b\n- [ ] c\n- [x] done\n- [x] a");
    const reopened = toggleChecklistItem(checkedA, block.items[1].id);
    expect(serializeNoteBlocks([reopened])).toBe("- [ ] b\n- [ ] c\n- [ ] done\n- [x] a");
  });

  it("moves open items among themselves", () => {
    const moved = moveOpenChecklistItem(checklist(md), 0, 2);
    expect(serializeNoteBlocks([moved])).toBe("- [ ] b\n- [ ] c\n- [ ] a\n- [x] done");
  });

  it("edits, inserts and removes items", () => {
    const block = checklist("  * [ ] a");
    const edited = setChecklistItemText(block, block.items[0].id, "apples");
    const { block: grown, id } = insertChecklistItem(edited, block.items[0].id, "pears");
    expect(serializeNoteBlocks([grown])).toBe("  * [ ] apples\n  * [ ] pears");
    expect(texts(removeChecklistItem(grown, id))).toEqual(["apples"]);
    expect(serializeNoteBlocks([setChecklistItemText(grown, id, "")])).toBe("  * [ ] apples\n  * [ ]");
  });
});

describe("block edits", () => {
  it("adds a checklist after text with a blank line, or in place of an empty text block", () => {
    const text = parseNoteBlocks("Hello");
    expect(serializeNoteBlocks(insertChecklistAfter(text, text[0].id).blocks)).toBe("Hello\n\n- [ ]");
    const empty = parseNoteBlocks("");
    expect(serializeNoteBlocks(insertChecklistAfter(empty, empty[0].id).blocks)).toBe("- [ ]");
  });

  it("drops an emptied checklist and merges the text around it", () => {
    const blocks = parseNoteBlocks("Before\n- [ ] x\nAfter");
    const merged = replaceNoteBlock(blocks, blocks[1].id, { ...(blocks[1] as ChecklistBlock), items: [] });
    expect(merged.map((b) => b.kind)).toEqual(["text"]);
    expect(serializeNoteBlocks(merged)).toBe("Before\nAfter");
  });
});

describe("isRichEditable", () => {
  it.each(["Hello **bold** and _it_", "# Heading\n\n- one\n  - two\n1. three", "[link](https://x.y) ~~gone~~", ""])(
    "accepts %j",
    (body) => expect(isRichEditable(body)).toBe(true),
  );

  it.each([
    "```\ncode\n```",
    "> quote",
    "| a | b |\n|---|---|",
    "---",
    "Title\n===",
    "use `code`",
    "<b>html</b>",
    "![img](x.png)",
    "[ref]: https://x.y",
    "line  \nbreak",
    "    indented code",
    "- [x] buy\n  milk",
  ])("rejects %j", (body) => expect(isRichEditable(body)).toBe(false));
});

describe("separateRichBlocks", () => {
  it("separates paragraphs, headings and lists but keeps list items together", () => {
    expect(separateRichBlocks("Hello\n# Groceries\n- apples\n  - green\n- pears\nAfter\nMore")).toBe(
      "Hello\n\n# Groceries\n\n- apples\n  - green\n- pears\n\nAfter\n\nMore",
    );
  });

  it("leaves existing blank lines alone", () => {
    expect(separateRichBlocks("a\n\nb\n\n\n- c\n- d")).toBe("a\n\nb\n\n\n- c\n- d");
    expect(separateRichBlocks("")).toBe("");
  });
});

describe("compactRichBlocks", () => {
  it("undoes separateRichBlocks", () => {
    const compact = "Hello\n# Groceries\n- apples\n  - green\n- pears\nAfter\nMore";
    expect(compactRichBlocks(separateRichBlocks(compact))).toBe(compact);
  });

  it("keeps runs of blank lines and blank lines inside lists", () => {
    expect(compactRichBlocks("a\n\n\nb\n- c\n\n- d")).toBe("a\n\n\nb\n- c\n\n- d");
  });
});
