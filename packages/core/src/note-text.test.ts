import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "./note-text";

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
