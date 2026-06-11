import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { type Ref, useImperativeHandle, useRef } from "react";
import { noteExtensions, parseNoteMarkdown } from "./note-extensions";

export type NoteEditorHandle = {
  focus: () => void;
};

type NoteEditorProps = {
  ref?: Ref<NoteEditorHandle>;
  initialContent: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onEscape?: () => void;
};

export function NoteEditor({ ref, initialContent, placeholder, onChange, onEscape }: NoteEditorProps) {
  // Keep latest callbacks without re-creating the editor.
  const callbacksRef = useRef({ onChange, onEscape });
  callbacksRef.current = { onChange, onEscape };

  const editor = useEditor({
    extensions: [...noteExtensions, Placeholder.configure({ placeholder: placeholder ?? "" })],
    // Parsed through the same pipeline as the card preview (including the
    // empty-task-item fixup) so the editor opens exactly what the card shows.
    content: parseNoteMarkdown(initialContent),
    editorProps: {
      attributes: {
        class: "note-prose min-h-40 max-h-[60vh] overflow-y-auto py-1 outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          callbacksRef.current.onEscape?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      callbacksRef.current.onChange(editor.getMarkdown());
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus("end"),
    }),
    [editor],
  );

  return <EditorContent editor={editor} />;
}
