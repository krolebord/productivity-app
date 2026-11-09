/** Plain-text preview of note markdown, for surfaces that don't render markdown. */
export function markdownToPlainText(markdown: string, maxLength?: number): string {
  const text = markdown
    .replace(/```[^\n]*\n?/g, "")
    .replace(/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
    .replace(/^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-*:?[ \t]*$/gm, "")
    .replace(/^[ \t]*\|(.*?)\|?[ \t]*$/gm, (_, cells: string) => cells.replace(/[ \t]*\|[ \t]*/g, " "))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/^\s{0,3}(#{1,6}|>+)\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\](?:\s+|$))?/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|\W)[*_](\S[^*_]*)[*_](?=\W|$)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return maxLength != null && text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

// A task list item's marker and box: "- [ ] ", "* [x] ", "1. [ ] ".
const TASK_MARKER_RE = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\](?:[ \t]+|$)/gm;

/**
 * Like `markdownToPlainText`, but keeps checklists readable: "- [ ] milk" becomes "☐ milk" and a
 * ticked item "☑ milk". For previews where a list of bare words would lose what they are (widgets).
 */
export function markdownToPreviewText(markdown: string, maxLength?: number): string {
  const marked = markdown.replace(TASK_MARKER_RE, (_, indent: string, mark: string) =>
    mark === " " ? `${indent}☐ ` : `${indent}☑ `,
  );
  return markdownToPlainText(marked, maxLength);
}

/**
 * A GFM task list item (`- [ ] …`) in note markdown. `segmentIndex` is its position
 * within its run of plain blocks: the native renderer numbers tasks per text segment,
 * restarting after each code block, table or blockquote.
 */
export type MarkdownTask = { line: number; checked: boolean; text: string; segmentIndex: number };

const FENCE_RE = /^(?:[ \t]*>)*[ \t]*(`{3,}|~{3,})(.*)$/;
const TASK_RE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)([^\n]*)$/;
const QUOTE_RE = /^ {0,3}>/;
const TABLE_RE = /^ {0,3}\|/;
// A GFM table's delimiter row, which marks a table even when its rows have no leading pipe.
const TABLE_DELIMITER_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Task list items in document order, skipping fenced code blocks. */
export function findMarkdownTasks(markdown: string): MarkdownTask[] {
  const tasks: MarkdownTask[] = [];
  let fence: string | null = null;
  let segmentIndex = 0;
  let inQuote = false;
  markdown.split("\n").forEach((raw, line) => {
    const text = raw.replace(/\r$/, "");
    const fenceMatch = FENCE_RE.exec(text);
    if (fence) {
      const [, marker = "", rest = ""] = fenceMatch ?? [];
      if (marker[0] === fence[0] && marker.length >= fence.length && !rest.trim()) fence = null;
      return;
    }
    const quoted = QUOTE_RE.test(text);
    // Entering or leaving a quote, or passing a table or code block, starts a new segment.
    if (quoted !== inQuote || (!quoted && (TABLE_RE.test(text) || isTableDelimiter(text)))) segmentIndex = 0;
    inQuote = quoted;
    // A backtick fence's info string can't contain backticks (that's inline code instead).
    if (fenceMatch && !(fenceMatch[1][0] === "`" && fenceMatch[2].includes("`"))) {
      fence = fenceMatch[1];
      segmentIndex = 0;
      return;
    }
    const task = TASK_RE.exec(text);
    if (task)
      tasks.push({ line, checked: task[2] !== " ", text: markdownToPlainText(task[3]), segmentIndex: segmentIndex++ });
  });
  return tasks;
}

// Needs a pipe, so a bare "---" (a rule or setext underline) doesn't count.
const isTableDelimiter = (line: string) => line.includes("|") && TABLE_DELIMITER_RE.test(line);

const normalizeSpace = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Finds the task a renderer's checkbox event refers to. The event only carries the
 * item's text and its index within its text segment, so an item must match both: its
 * text (allowing nested items' text to follow it) and that index. When that leaves
 * several candidates (the same text at the same spot in different segments) or none
 * (e.g. a multi-line label read differently), it returns undefined rather than guess.
 */
function findPressedTask(tasks: MarkdownTask[], index: number, text: string | undefined) {
  const pressed = normalizeSpace(text ?? "");
  let candidates = tasks;
  if (pressed) {
    const exact = tasks.filter((task) => normalizeSpace(task.text) === pressed);
    candidates =
      exact.length > 0
        ? exact
        : tasks.filter((task) => {
            const own = normalizeSpace(task.text);
            return own !== "" && pressed.startsWith(`${own} `);
          });
  }
  const bySegment = candidates.filter((task) => task.segmentIndex === index);
  return bySegment.length === 1 ? bySegment[0] : undefined;
}

/**
 * Rewrites the `[ ]`/`[x]` of one task list item, leaving every other byte of the
 * markdown alone. `index` and `text` come from the renderer's checkbox event. Returns
 * the markdown unchanged when the item can't be identified for sure.
 */
export function setMarkdownTaskChecked(
  markdown: string,
  { index, checked, text }: { index: number; checked: boolean; text?: string },
): string {
  const task = findPressedTask(findMarkdownTasks(markdown), index, text);
  if (!task || task.checked === checked) return markdown;

  const lines = markdown.split("\n");
  lines[task.line] = lines[task.line].replace(
    TASK_RE,
    (_, prefix: string, _mark: string, rest: string) => `${prefix}[${checked ? "x" : " "}]${rest}`,
  );
  return lines.join("\n");
}
