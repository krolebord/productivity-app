import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { noteExtensions, parseNoteMarkdown } from "./note-extensions";

export function NoteMarkdown({ content, className }: { content: string; className?: string }) {
  const rendered = useMemo(
    () =>
      renderToReactElement({
        content: parseNoteMarkdown(content),
        extensions: noteExtensions,
        options: {
          nodeMapping: {
            // Same DOM as TaskItem's renderHTML, but with defaultChecked so
            // React doesn't treat the static checkbox as a controlled input.
            taskItem: ({ node, children }) => (
              <li data-checked={node.attrs?.checked ?? false} data-type="taskItem">
                <label>
                  <input type="checkbox" defaultChecked={node.attrs?.checked ?? false} readOnly />
                  <span />
                </label>
                <div>{children}</div>
              </li>
            ),
          },
        },
      }),
    [content],
  );

  return <div className={cn("note-prose", className)}>{rendered}</div>;
}
