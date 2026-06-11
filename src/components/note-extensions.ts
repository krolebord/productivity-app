import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Shared between the note editor and the static card preview so both
 * parse and render markdown identically.
 */
export const noteExtensions = [
  // Underline is excluded: it has no markdown representation.
  StarterKit.configure({ underline: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Markdown.configure({ markedOptions: { gfm: true } }),
];

const markdownManager = new MarkdownManager({
  extensions: noteExtensions,
  markedOptions: { gfm: true },
});

export function parseNoteMarkdown(markdown: string): JSONContent {
  const doc = markdownManager.parse(markdown);
  return { ...doc, content: splitMisparsedTaskItems(doc.content ?? []) };
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
