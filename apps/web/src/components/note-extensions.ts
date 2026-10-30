import { generateId } from "@sqlite-sync/core";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { renderTableToMarkdown, Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownRendererHelpers,
  type MarkdownToken,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItemView } from "./task-item-view";

const dragIdPluginKey = new PluginKey("taskItemDragId");

/**
 * TaskItem augmented with a transient `dragId` (a stable handle for dnd-kit
 * reordering) and a React node view that renders the drag handle. The id is
 * never written to the DOM or markdown — it only needs to stay stable for the
 * lifetime of an editing session.
 */
const DraggableTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dragId: { default: null, rendered: false, parseHTML: () => null, renderHTML: () => ({}) },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(TaskItemView);
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      // Splitting copies attributes, so reassign duplicate drag IDs as well as missing ones.
      new Plugin({
        key: dragIdPluginKey,
        appendTransaction: (_transactions, _oldState, newState) => {
          const { tr, doc } = newState;
          const seen = new Set<string>();
          let modified = false;
          doc.descendants((child, pos) => {
            if (child.type.name !== "taskItem") return;
            const id = child.attrs.dragId as string | null;
            if (!id || seen.has(id)) {
              const fresh = generateId();
              tr.setNodeAttribute(pos, "dragId", fresh);
              seen.add(fresh);
              modified = true;
            } else {
              seen.add(id);
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});

const BLOCK_SEPARATOR = "\u0000block\u0000";

/**
 * Heading that remembers whether the source had no blank line before/after it ("# Title\ntext",
 * as typed on mobile), so serializing doesn't add one. Set by parseNoteMarkdown, never
 * rendered, and not copied when a heading is split.
 */
const NoteHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tightBefore: { default: false, rendered: false, keepOnSplit: false },
      tightAfter: { default: false, rendered: false, keepOnSplit: false },
    };
  },
});

const isEmptyParagraph = (node: JSONContent | undefined) => node?.type === "paragraph" && !node.content?.length;

/**
 * Joins top-level blocks with a blank line like the stock Document, except next to a tight
 * heading. An ATX heading always takes exactly its own line, so a single newline is safe
 * on either side of it whatever the neighbouring block is (but an empty paragraph needs
 * the blank lines that encode it).
 */
const NoteDocument = Document.extend({
  renderMarkdown: (node, h) => {
    const children = [...(node.content ?? [])];
    // The editor keeps an empty paragraph after a trailing list or table (TrailingNode);
    // it isn't content, so don't save it as trailing blank lines.
    while (children.length > 1 && isEmptyParagraph(children[children.length - 1])) children.pop();
    const parts = h.renderChildren(children, BLOCK_SEPARATOR).split(BLOCK_SEPARATOR);
    return parts.reduce((out, part, i) => {
      if (i === 0) return part;
      const [prev, next] = [children[i - 1], children[i]];
      const tight =
        !isEmptyParagraph(prev) &&
        !isEmptyParagraph(next) &&
        ((prev?.type === "heading" && prev.attrs?.tightAfter) || (next?.type === "heading" && next.attrs?.tightBefore));
      return out + (tight ? "\n" : "\n\n") + part;
    }, "");
  },
});

/**
 * The stock GFM table serializer, minus the blank lines it wraps the table in (the document
 * already separates blocks) and with alignment colons fitted into the column width, so a
 * table it wrote parses and serializes back unchanged.
 */
function renderNoteTable(node: JSONContent, h: MarkdownRendererHelpers) {
  const lines = renderTableToMarkdown(node, h)
    .replace(/^\n+|\n+$/g, "")
    .split("\n");
  if (lines.length < 2) return lines.join("\n");
  const widths = lines[0]
    .slice(2, -2)
    .split(" | ")
    .map((cell) => cell.length);
  const delimiters = lines[1].slice(2, -2).split(" | ");
  if (delimiters.length === widths.length) {
    const fitted = delimiters.map((delimiter, i) => {
      const left = delimiter.startsWith(":") ? ":" : "";
      const right = delimiter.endsWith(":") ? ":" : "";
      return left + "-".repeat(Math.max(1, widths[i] - left.length - right.length)) + right;
    });
    lines[1] = `| ${fitted.join(" | ")} |`;
  }
  return lines.join("\n");
}

const isBreakTag = (token: MarkdownToken) => token.type === "html" && /^<br\s*\/?>$/i.test(token.raw ?? "");

/**
 * Cells have to stay on one line, so the serializer writes a line break in a cell (Shift+Enter)
 * as `<br>`. Turn those inline HTML tokens back into hard breaks while parsing a cell: code
 * spans and escaped `&lt;br&gt;` are other token types and stay text.
 */
function withCellBreaks(helpers: MarkdownParseHelpers): MarkdownParseHelpers {
  return {
    ...helpers,
    parseInline: (tokens) => {
      const segments: MarkdownToken[][] = [[]];
      for (const inline of tokens) {
        if (isBreakTag(inline)) segments.push([]);
        else segments[segments.length - 1].push(inline);
      }
      return segments.flatMap((segment, i) => [
        ...(i > 0 ? [{ type: "hardBreak" }] : []),
        ...(segment.length ? helpers.parseInline(segment) : []),
      ]);
    },
  };
}

const NoteTable = Table.extend({
  parseMarkdown(token, helpers) {
    // biome-ignore lint/style/noNonNullAssertion: Table defines parseMarkdown.
    return this.parent!(token, withCellBreaks(helpers));
  },
  renderMarkdown: renderNoteTable,
});

export const noteExtensions = [
  StarterKit.configure({ underline: false, document: false, heading: false }),
  NoteDocument,
  NoteHeading,
  TaskList,
  DraggableTaskItem.configure({ nested: true }),
  // GFM tables, so tables written elsewhere (e.g. on mobile) survive a web edit.
  // Tab moves between cells and adds a row after the last one.
  NoteTable.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Markdown.configure({ markedOptions: { gfm: true } }),
];

const markdownManager = new MarkdownManager({
  extensions: noteExtensions,
  markedOptions: { gfm: true },
});

export function parseNoteMarkdown(markdown: string): JSONContent {
  const doc = markdownManager.parse(markdown);
  const content = stampDragIds(splitMisparsedTaskItems(doc.content ?? []));
  return { ...doc, content: markTightHeadings(markdown, content) };
}

/**
 * Flags top-level headings that have no blank line before/after them in the source. The
 * parsed tokens no longer carry the spacing, so lex again and pair heading tokens with
 * heading nodes in order (only top-level heading tokens produce top-level headings).
 */
function markTightHeadings(markdown: string, nodes: JSONContent[]): JSONContent[] {
  const { Lexer, defaults } = markdownManager.instance;
  const tokens = new Lexer(defaults).lex(markdown);
  // marked folds a block's trailing newlines into its raw text or a following space token.
  const tightAfter = (i: number) => {
    const next = tokens[i + 1];
    return next != null && next.type !== "space" && !/\n\n$/.test(tokens[i].raw);
  };
  const headings: { tightBefore: boolean; tightAfter: boolean }[] = [];
  tokens.forEach((token, i) => {
    if (token.type === "heading") headings.push({ tightBefore: i > 0 && tightAfter(i - 1), tightAfter: tightAfter(i) });
  });
  if (headings.length !== nodes.filter((node) => node.type === "heading").length) return nodes;

  let index = 0;
  return nodes.map((node) => {
    if (node.type !== "heading") return node;
    const tight = headings[index++];
    return tight.tightBefore || tight.tightAfter ? { ...node, attrs: { ...node.attrs, ...tight } } : node;
  });
}

export function noteContentToPlainText(markdown: string, maxLength?: number): string {
  const parts: string[] = [];
  let length = 0;
  const walk = (node: JSONContent): boolean => {
    if (node.text) {
      parts.push(node.text);
      length += node.text.length + 1;
      if (maxLength != null && length >= maxLength) return true;
    }
    for (const child of node.content ?? []) {
      if (walk(child)) return true;
    }
    return false;
  };
  for (const node of parseNoteMarkdown(markdown).content ?? []) {
    if (walk(node)) break;
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return maxLength != null ? text.slice(0, maxLength) : text;
}

function stampDragIds(nodes: JSONContent[]): JSONContent[] {
  return nodes.map((node) => {
    const content = node.content ? stampDragIds(node.content) : node.content;
    if (node.type === "taskItem") {
      return { ...node, attrs: { ...node.attrs, dragId: node.attrs?.dragId ?? generateId() }, content };
    }
    return content ? { ...node, content } : node;
  });
}

const EMPTY_TASK_RE = /^\[([ xX])\]$/;

/**
 * @tiptap/markdown fails to recognize empty task items ("- [ ] ") when the
 * same markdown list also contains plain bullet items (adjacent bullet/task
 * lists merge into one list in markdown), leaving literal "[ ]" bullets.
 * Detect those and rebuild them as task items, splitting the list as needed.
 */
function splitMisparsedTaskItems(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];

  for (const node of nodes) {
    const children = node.content ? splitMisparsedTaskItems(node.content) : undefined;
    const current = children ? { ...node, content: children } : node;

    if (current.type !== "bulletList" || !current.content?.some(emptyTaskItemMark)) {
      out.push(current);
      continue;
    }

    let run: JSONContent | undefined;
    for (const item of current.content) {
      const mark = emptyTaskItemMark(item);
      const type = mark ? "taskList" : "bulletList";
      if (!run || run.type !== type) {
        // Continue a preceding list of the same type (e.g. a real taskList
        // parsed just before a misparsed run) instead of starting a new one.
        const prev = out[out.length - 1];
        run = prev?.type === type && prev.content ? prev : { ...current, type, content: [] };
        if (run !== prev) out.push(run);
      }
      run.content?.push(
        mark
          ? {
              type: "taskItem",
              attrs: { checked: mark !== " " },
              content: [{ type: "paragraph" }, ...(item.content?.slice(1) ?? [])],
            }
          : item,
      );
    }
  }

  return out;
}

function emptyTaskItemMark(item: JSONContent): string | null {
  if (item.type !== "listItem") return null;
  const [first] = item.content ?? [];
  if (first?.type !== "paragraph" || first.content?.length !== 1) return null;
  const [text] = first.content;
  if (text.type !== "text" || !text.text) return null;
  return EMPTY_TASK_RE.exec(text.text.trim())?.[1] ?? null;
}
