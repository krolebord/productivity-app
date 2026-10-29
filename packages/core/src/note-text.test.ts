import { describe, expect, it } from "vitest";
import { findMarkdownTasks, markdownToPlainText, setMarkdownTaskChecked } from "./note-text";

describe("markdownToPlainText", () => {
  it("strips block and inline syntax", () => {
    expect(
      markdownToPlainText(
        "# Title\n\n- [x] **done** item\n- [ ] _open_ [link](https://x.y)\n> quote\n```ts\ncode\n```",
      ),
    ).toBe("Title done item open link quote code");
  });

  it("truncates to the max length", () => {
    expect(markdownToPlainText("hello world", 5)).toBe("hello…");
  });
});

describe("markdownToPlainText previews", () => {
  it("drops tables, rules, html and escapes", () => {
    expect(markdownToPlainText("| a | b |\n|---|:-:|\n| 1 | 2 |\n\n---\n<br>x\\*y <https://e.com>")).toBe(
      "a b 1 2 x*y https://e.com",
    );
  });

  it("strips empty task markers", () => {
    expect(markdownToPlainText("- [ ]\n- [x] done")).toBe("done");
  });
});

describe("findMarkdownTasks", () => {
  it("finds tasks in document order, skipping fenced code", () => {
    const markdown = [
      "- [ ] one",
      "  - [x] nested",
      "```md",
      "- [ ] in code",
      "```",
      "1. [X] ordered",
      "> - [ ] quoted",
      "- [ ]",
      "- not a task",
      "-[ ] no space",
      "~~~",
      "- [ ] tilde code",
      "~~~",
    ].join("\n");
    expect(findMarkdownTasks(markdown)).toEqual([
      { line: 0, checked: false, text: "one", segmentIndex: 0 },
      { line: 1, checked: true, text: "nested", segmentIndex: 1 },
      // The code block and the quote each start a new segment.
      { line: 5, checked: true, text: "ordered", segmentIndex: 0 },
      { line: 6, checked: false, text: "quoted", segmentIndex: 0 },
      { line: 7, checked: false, text: "", segmentIndex: 0 },
    ]);
  });
});

describe("setMarkdownTaskChecked", () => {
  const markdown = "# List\r\n* [ ] **first**  \r\n* [x] second\r\n\r\n```\r\n- [ ] code\r\n```\r\n- [ ] third";

  it("rewrites only the task's checkbox", () => {
    expect(setMarkdownTaskChecked(markdown, { index: 0, checked: true, text: "first" })).toBe(
      markdown.replace("* [ ] **first**", "* [x] **first**"),
    );
    expect(setMarkdownTaskChecked(markdown, { index: 1, checked: false, text: "second" })).toBe(
      markdown.replace("* [x] second", "* [ ] second"),
    );
    expect(setMarkdownTaskChecked(markdown, { index: 0, checked: true, text: "third" })).toBe(
      markdown.replace("- [ ] third", "- [x] third"),
    );
  });

  it("is a no-op when the state already matches or the task is missing", () => {
    expect(setMarkdownTaskChecked(markdown, { index: 1, checked: true })).toBe(markdown);
    expect(setMarkdownTaskChecked(markdown, { index: 9, checked: true })).toBe(markdown);
  });

  it("reads the index per segment, as the renderer numbers tasks", () => {
    const markdown = "- [ ] item\n- [ ] other\n\n| a |\n|---|\n\n- [ ] other";
    expect(setMarkdownTaskChecked(markdown, { index: 1, checked: true, text: "other" })).toBe(
      "- [ ] item\n- [x] other\n\n| a |\n|---|\n\n- [ ] other",
    );
    expect(setMarkdownTaskChecked(markdown, { index: 0, checked: true, text: "other" })).toBe(
      "- [ ] item\n- [ ] other\n\n| a |\n|---|\n\n- [x] other",
    );
  });

  it("leaves the markdown alone when the pressed item is ambiguous", () => {
    const markdown = "- [ ] repeat\n\n```\ncode\n```\n\n- [ ] repeat";
    expect(setMarkdownTaskChecked(markdown, { index: 0, checked: true, text: "repeat" })).toBe(markdown);
    expect(setMarkdownTaskChecked("- [ ] a\n- [ ] b", { index: 0, checked: true, text: "gone" })).toBe(
      "- [ ] a\n- [ ] b",
    );
  });

  it("matches a nested item's parent by the start of its text", () => {
    expect(
      setMarkdownTaskChecked("- [ ] parent\n  - [ ] child", { index: 0, checked: true, text: "parent child" }),
    ).toBe("- [x] parent\n  - [ ] child");
  });

  it("leaves the markdown alone when the text and index disagree", () => {
    expect(setMarkdownTaskChecked(markdown, { index: 1, checked: true, text: "third" })).toBe(markdown);
    // The renderer reads the first item's label as "one two", which is also the second item's text.
    const multiline = "- [ ] one\n  two\n- [ ] one two";
    expect(setMarkdownTaskChecked(multiline, { index: 0, checked: true, text: "one two" })).toBe(multiline);
  });

  it("starts a new segment at a table without leading pipes", () => {
    const markdown = "- [ ] other\n\na | b\n--- | ---\nx | y\n\n- [ ] other";
    expect(setMarkdownTaskChecked(markdown, { index: 0, checked: true, text: "other" })).toBe(markdown);
    expect(findMarkdownTasks(markdown).map((task) => task.segmentIndex)).toEqual([0, 0]);
  });
});
