import { generateId } from "@sqlite-sync/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { type JSONContent, ReactNodeViewRenderer } from "@tiptap/react";
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
      // Keep every task item's dragId unique. Splitting an item (pressing
      // Enter) copies its attributes, so new items inherit the parent's
      // dragId — reassign anything missing or already seen, not just nulls.
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

/**
 * Shared between the note editor and the static card preview so both
 * parse and render markdown identically.
 */
export const noteExtensions = [
  // Underline is excluded: it has no markdown representation.
  StarterKit.configure({ underline: false }),
  TaskList,
  DraggableTaskItem.configure({ nested: true }),
  Markdown.configure({ markedOptions: { gfm: true } }),
];

const markdownManager = new MarkdownManager({
  extensions: noteExtensions,
  markedOptions: { gfm: true },
});

export function parseNoteMarkdown(markdown: string): JSONContent {
  const doc = markdownManager.parse(markdown);
  return { ...doc, content: stampDragIds(splitMisparsedTaskItems(doc.content ?? [])) };
}

/**
 * A single-line, plain-text preview of a note's markdown content — used as a
 * fallback label when a note has no title. Parses with the shared markdown
 * pipeline and joins the text nodes, so it stays in sync with how notes render.
 *
 * Pass `maxLength` to stop walking once enough text is collected — handy for
 * long notes where only a short preview is displayed.
 */
export function noteContentToPlainText(markdown: string, maxLength?: number): string {
  const parts: string[] = [];
  let length = 0;
  const walk = (node: JSONContent): boolean => {
    if (node.text) {
      parts.push(node.text);
      length += node.text.length + 1; // +1 for the joining space
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

/** Give every task item a stable dragId up front (the editor reorders by it). */
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

/** Returns the checkbox mark (" " or "x") if the list item is a misparsed empty task item. */
function emptyTaskItemMark(item: JSONContent): string | null {
  if (item.type !== "listItem") return null;
  const [first] = item.content ?? [];
  if (first?.type !== "paragraph" || first.content?.length !== 1) return null;
  const [text] = first.content;
  if (text.type !== "text" || !text.text) return null;
  return EMPTY_TASK_RE.exec(text.text.trim())?.[1] ?? null;
}
