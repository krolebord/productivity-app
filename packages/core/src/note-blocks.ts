/**
 * Note markdown split into the blocks the mobile editor edits separately: runs of task list
 * items become checklists (edited as rows), everything else stays text. Serializing an
 * untouched document gives back the exact input, so opening a note never rewrites it; only
 * the block that was edited changes.
 */

export type ChecklistItem = {
  id: string;
  /** Leading whitespace; nesting depth for display. */
  indent: string;
  /** `-`, `*`, `+` or `1.`/`1)`. */
  marker: string;
  /** Whitespace between the marker and `[ ]`. */
  gap: string;
  /** The character inside the brackets: " ", "x" or "X". */
  mark: string;
  /** Text after `]` as written, including its leading space. */
  rest: string;
};

export type TextBlock = {
  kind: "text";
  id: string;
  /** Blank lines before and after the body, kept verbatim. */
  lead: string[];
  body: string;
  trail: string[];
};

export type ChecklistBlock = { kind: "checklist"; id: string; items: ChecklistItem[] };

export type NoteBlock = TextBlock | ChecklistBlock;

let nextId = 0;
/** Ids only need to be unique within the editing session. */
export const newNoteBlockId = () => `nb${++nextId}`;

const TASK_LINE_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)\[([ xX])\]((?:[ \t][^\n]*)?)$/;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;
const QUOTE_RE = /^ {0,3}>/;
const isBlank = (line: string) => line.trim() === "";

export const isItemChecked = (item: ChecklistItem) => item.mark !== " ";
/** The item's text for editing: what follows `] `. */
export const itemText = (item: ChecklistItem) => item.rest.replace(/^[ \t]/, "");
export const itemDepth = (item: ChecklistItem) => Math.floor(item.indent.replace(/\t/g, "  ").length / 2);

export function parseNoteBlocks(markdown: string): NoteBlock[] {
  const lines = markdown === "" ? [] : markdown.split("\n");
  // Which lines are checklist items: task lines outside code fences and quotes.
  const isTask: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      isTask.push(false);
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      isTask.push(false);
      continue;
    }
    isTask.push(!QUOTE_RE.test(line) && TASK_LINE_RE.test(line));
  }
  // A run whose last item continues on an indented line (a lazy continuation or a nested
  // paragraph) can't be edited as rows without breaking that item, so it stays text.
  for (let start = 0; start < lines.length; ) {
    if (!isTask[start]) {
      start++;
      continue;
    }
    let end = start;
    while (end + 1 < lines.length && isTask[end + 1]) end++;
    const next = lines[end + 1];
    if (next !== undefined && !isBlank(next) && /^[ \t]/.test(next)) {
      for (let i = start; i <= end; i++) isTask[i] = false;
    }
    start = end + 1;
  }

  const blocks: NoteBlock[] = [];
  let textLines: string[] = [];
  const flushText = () => {
    if (textLines.length === 0) return;
    blocks.push(textBlock(textLines));
    textLines = [];
  };
  lines.forEach((line, i) => {
    if (!isTask[i]) {
      textLines.push(line);
      return;
    }
    flushText();
    const last = blocks[blocks.length - 1];
    const item = parseItem(line);
    if (last?.kind === "checklist" && isTask[i - 1]) last.items.push(item);
    else blocks.push({ kind: "checklist", id: newNoteBlockId(), items: [item] });
  });
  flushText();
  if (blocks.length === 0) blocks.push(emptyTextBlock());
  return blocks;
}

function parseItem(line: string): ChecklistItem {
  const [, indent, marker, gap, mark, rest] = TASK_LINE_RE.exec(line) ?? [];
  return { id: newNoteBlockId(), indent, marker, gap, mark, rest };
}

function textBlock(lines: string[]): TextBlock {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start])) start++;
  while (end > start && isBlank(lines[end - 1])) end--;
  return {
    kind: "text",
    id: newNoteBlockId(),
    lead: lines.slice(0, start),
    body: lines.slice(start, end).join("\n"),
    trail: lines.slice(end),
  };
}

export const emptyTextBlock = (lead: string[] = []): TextBlock => ({
  kind: "text",
  id: newNoteBlockId(),
  lead,
  body: "",
  trail: [],
});

export function serializeNoteBlocks(blocks: readonly NoteBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.kind === "checklist") {
      for (const item of block.items) {
        lines.push(`${item.indent}${item.marker}${item.gap}[${item.mark}]${item.rest}`);
      }
    } else {
      lines.push(...block.lead);
      if (block.body !== "") lines.push(...block.body.split("\n"));
      lines.push(...block.trail);
    }
  }
  return lines.join("\n");
}

/**
 * Whether a text block can go through the rich text input, which edits paragraphs,
 * headings, bullet/numbered lists, bold, italic, strikethrough and links. Anything else
 * (code, quotes, tables, rules, HTML, images, inline code…) is edited as raw markdown so
 * the input can't drop or reshape it.
 */
export function isRichEditable(body: string): boolean {
  const lines = body.split("\n");
  return lines.every((line, i) => {
    if (FENCE_RE.test(line) || QUOTE_RE.test(line)) return false;
    if (TASK_LINE_RE.test(line)) return false; // task items the parser left in text (e.g. with continuations)
    if (/^ {0,3}\|/.test(line) || /\|[ \t]*:?-{3,}/.test(line)) return false; // tables
    if (/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) return false; // rules, setext underlines
    if (/^ {0,3}=+[ \t]*$/.test(line)) return false;
    if (/`|<[a-zA-Z/!]|!\[|\[\^|\$\$/.test(line)) return false; // code, HTML/autolinks, images, footnotes, math
    if (/^ {0,3}\[[^\]]+\]:/.test(line)) return false; // link reference definitions
    if (/( {2}|\\)$/.test(line) && i < lines.length - 1) return false; // hard line breaks
    // Indented code: an indented line that doesn't continue a list.
    if (/^( {4}|\t)/.test(line) && !/^[ \t]*([-*+]|\d{1,9}[.)])[ \t]/.test(line)) return false;
    return true;
  });
}

/** Unchecked items first, then checked ones, each in their current order (as Keep shows them). */
const sinkChecked = (items: readonly ChecklistItem[]) => [
  ...items.filter((item) => !isItemChecked(item)),
  ...items.filter(isItemChecked),
];

export function toggleChecklistItem(block: ChecklistBlock, id: string): ChecklistBlock {
  const items = block.items.map((item) => (item.id === id ? { ...item, mark: isItemChecked(item) ? " " : "x" } : item));
  const toggled = items.find((item) => item.id === id);
  if (!toggled) return block;
  // A checked item sinks to the end; an unchecked one rejoins the end of the open items.
  const rest = items.filter((item) => item.id !== id);
  const open = rest.filter((item) => !isItemChecked(item));
  const done = rest.filter(isItemChecked);
  return {
    ...block,
    items: isItemChecked(toggled) ? [...open, ...done, toggled] : [...open, toggled, ...done],
  };
}

/** Moves an open item from one slot to another among the open items. */
export function moveOpenChecklistItem(block: ChecklistBlock, from: number, to: number): ChecklistBlock {
  const sorted = sinkChecked(block.items);
  const open = sorted.filter((item) => !isItemChecked(item));
  if (from === to || from < 0 || to < 0 || from >= open.length || to >= open.length) return block;
  const [moved] = open.splice(from, 1);
  open.splice(to, 0, moved);
  return { ...block, items: [...open, ...sorted.filter(isItemChecked)] };
}

export function setChecklistItemText(block: ChecklistBlock, id: string, text: string): ChecklistBlock {
  return {
    ...block,
    items: block.items.map((item) => (item.id === id ? { ...item, rest: text === "" ? "" : ` ${text}` } : item)),
  };
}

/** A new open item after `afterId` (or at the end), shaped like its neighbour. Returns its id. */
export function insertChecklistItem(
  block: ChecklistBlock,
  afterId: string | null,
  text = "",
): { block: ChecklistBlock; id: string } {
  const index = afterId == null ? block.items.length - 1 : block.items.findIndex((item) => item.id === afterId);
  const like = block.items[index] ?? block.items[0];
  const item: ChecklistItem = {
    id: newNoteBlockId(),
    indent: like?.indent ?? "",
    marker: like && /^\d/.test(like.marker) ? like.marker : (like?.marker ?? "-"),
    gap: like?.gap ?? " ",
    mark: " ",
    rest: text === "" ? "" : ` ${text}`,
  };
  const items = [...block.items];
  items.splice(index + 1, 0, item);
  return { block: { ...block, items }, id: item.id };
}

export function removeChecklistItem(block: ChecklistBlock, id: string): ChecklistBlock {
  return { ...block, items: block.items.filter((item) => item.id !== id) };
}

export const newChecklistBlock = (): { block: ChecklistBlock; itemId: string } => {
  const itemId = newNoteBlockId();
  return {
    block: {
      kind: "checklist",
      id: newNoteBlockId(),
      items: [{ id: itemId, indent: "", marker: "-", gap: " ", mark: " ", rest: "" }],
    },
    itemId,
  };
};

/**
 * Inserts a checklist after the block with `afterId`. A blank line separates it from text
 * before it, so the text's last paragraph or list doesn't absorb the first item. An empty
 * text block is replaced instead.
 */
export function insertChecklistAfter(
  blocks: readonly NoteBlock[],
  afterId: string | null,
): { blocks: NoteBlock[]; itemId: string } {
  const { block, itemId } = newChecklistBlock();
  const index = afterId == null ? blocks.length - 1 : blocks.findIndex((b) => b.id === afterId);
  const target = blocks[index];
  const next = [...blocks];
  if (target?.kind === "text" && target.body === "") {
    next.splice(index, 1, ...(target.lead.length ? [{ ...target, trail: [] }] : []), block);
    return { blocks: next, itemId };
  }
  if (target?.kind === "text" && target.trail.length === 0) next[index] = { ...target, trail: [""] };
  next.splice(index + 1, 0, block);
  return { blocks: next, itemId };
}

/** Replaces one block, dropping a checklist left without items and merging text blocks that end up adjacent. */
export function replaceNoteBlock(blocks: readonly NoteBlock[], id: string, block: NoteBlock | null): NoteBlock[] {
  const next: NoteBlock[] = [];
  for (const current of blocks) {
    const value = current.id === id ? block : current;
    if (!value || (value.kind === "checklist" && value.items.length === 0)) continue;
    const prev = next[next.length - 1];
    if (prev?.kind === "text" && value.kind === "text") {
      next[next.length - 1] = mergeText(prev, value);
      continue;
    }
    next.push(value);
  }
  return next.length ? next : [emptyTextBlock()];
}

function mergeText(a: TextBlock, b: TextBlock): TextBlock {
  const lines = [...a.lead, ...(a.body ? a.body.split("\n") : []), ...a.trail, ...b.lead];
  // A new id: the merged text is new content for the editor showing it.
  return textBlock([...lines, ...(b.body ? b.body.split("\n") : []), ...b.trail]);
}

const LIST_ITEM_RE = /^[ \t]*([-*+]|\d{1,9}[.)])[ \t]/;

/**
 * The rich input writes one line per paragraph, heading or list item with single line
 * breaks. In markdown that merges paragraphs and lets a paragraph after a list continue its
 * last item, so blocks get a blank line between them; consecutive list items stay together.
 */
export function separateRichBlocks(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  lines.forEach((line, i) => {
    const previous = lines[i - 1];
    if (
      previous !== undefined &&
      !isBlank(previous) &&
      !isBlank(line) &&
      !(LIST_ITEM_RE.test(previous) && LIST_ITEM_RE.test(line))
    ) {
      out.push("");
    }
    out.push(line);
  });
  return out.join("\n");
}

/**
 * The inverse of separateRichBlocks, for loading markdown into the rich input: it shows
 * every blank line as an empty paragraph, so the single blank line between two blocks is
 * dropped (the input keeps them as separate blocks either way). Other blank lines stay.
 */
export function compactRichBlocks(markdown: string): string {
  const lines = markdown.split("\n");
  return lines
    .filter((line, i) => {
      if (!isBlank(line)) return true;
      const previous = lines[i - 1];
      const next = lines[i + 1];
      if (previous === undefined || next === undefined || isBlank(previous) || isBlank(next)) return true;
      return LIST_ITEM_RE.test(previous) && LIST_ITEM_RE.test(next);
    })
    .join("\n");
}
