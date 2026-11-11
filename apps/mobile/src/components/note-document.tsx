import {
  type ChecklistBlock,
  emptyTextBlock,
  insertChecklistAfter,
  type NoteBlock,
  parseNoteBlocks,
  replaceNoteBlock,
  serializeNoteBlocks,
} from "@productivity/core/note-blocks";
import { type Ref, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { type ChecklistFocus, NoteChecklist } from "./note-checklist";
import { NoteTextBlock, type NoteTextBlockHandle } from "./note-text-block";

export type NoteDocumentHandle = {
  /** Focuses the start of the document (after the title). */
  focus: () => void;
  /** Adds a checklist after the block being edited, or at the end, and focuses its first item. */
  addChecklist: () => void;
};

/**
 * A note's or task's markdown edited as blocks: checklists as rows, everything else as rich
 * text. The markdown is parsed once; afterwards this component owns it and reports every
 * edit as the whole serialized document.
 */
export function NoteDocument({
  ref,
  markdown,
  placeholder,
  onChange,
  onDraggingChange,
}: {
  ref?: Ref<NoteDocumentHandle>;
  markdown: string;
  placeholder: string;
  onChange: (markdown: string) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const [blocks, setBlocks] = useState(() => parseNoteBlocks(markdown));
  const blocksRef = useRef(blocks);
  const [focus, setFocus] = useState<ChecklistFocus>(null);
  const [focusText, setFocusText] = useState<string | null>(null);
  const activeBlock = useRef<string | null>(null);
  // An empty text block a new checklist replaced, still shown until the checklist has focus:
  // unmounting the focused editor blurs it, which on Android hides the keyboard just reopened.
  const [replaced, setReplaced] = useState<{ block: NoteBlock; before: string } | null>(null);
  const textBlocks = useRef(new Map<string, NoteTextBlockHandle>());

  const commit = (next: NoteBlock[]) => {
    blocksRef.current = next;
    setBlocks(next);
    onChange(serializeNoteBlocks(next));
  };
  const replace = (id: string, block: NoteBlock | null) => commit(replaceNoteBlock(blocksRef.current, id, block));

  useLayoutEffect(() => {
    if (!focusText) return;
    const handle = textBlocks.current.get(focusText);
    if (!handle) return;
    handle.focus();
    setFocusText(null);
  });

  const focusBlock = (block: NoteBlock | undefined) => {
    if (!block) return;
    if (block.kind === "text") setFocusText(block.id);
    else {
      const item = block.items.find((i) => i.mark === " ") ?? block.items[0];
      if (item) setFocus({ itemId: item.id, at: "end" });
    }
  };

  useImperativeHandle(ref, () => ({
    focus: () => focusBlock(blocksRef.current[0]),
    addChecklist: () => {
      const { blocks: next, itemId } = insertChecklistAfter(blocksRef.current, activeBlock.current);
      const active = blocksRef.current.find((b) => b.id === activeBlock.current);
      const checklist = next.find((b): b is ChecklistBlock => b.kind === "checklist" && b.items[0]?.id === itemId);
      if (active && checklist && !next.some((b) => b.id === active.id)) {
        setReplaced({ block: active, before: checklist.id });
      }
      commit(next);
      setFocus({ itemId, at: "start" });
    },
  }));

  // Tapping below the last block continues the document: as text after a checklist.
  const continueAtEnd = () => {
    const last = blocksRef.current.at(-1);
    if (last?.kind === "text") return focusBlock(last);
    // Only shown for now: it reaches the saved markdown with the next edit, not by tapping.
    const text = emptyTextBlock([""]);
    blocksRef.current = [...blocksRef.current, text];
    setBlocks(blocksRef.current);
    setFocusText(text.id);
  };

  const textBlock = (block: Extract<NoteBlock, { kind: "text" }>, retired = false) => (
    <NoteTextBlock
      key={block.id}
      ref={(handle) => {
        if (handle) textBlocks.current.set(block.id, handle);
        else textBlocks.current.delete(block.id);
      }}
      block={block}
      placeholder={blocks.length === 1 && !retired ? placeholder : undefined}
      onChange={(body) => {
        const current = blocksRef.current.find((b) => b.id === block.id);
        if (current?.kind === "text") replace(block.id, { ...current, body });
      }}
      onFocus={() => {
        activeBlock.current = block.id;
      }}
    />
  );

  return (
    <View className="flex-grow">
      {/* Flat, so the replaced block keeps its key's slot and isn't remounted. */}
      {blocks.flatMap((block, index) => [
        ...(replaced?.before === block.id && replaced.block.kind === "text" ? [textBlock(replaced.block, true)] : []),
        block.kind === "text" ? (
          textBlock(block)
        ) : (
          <NoteChecklist
            key={block.id}
            block={block}
            onUpdate={(edit) => {
              const current = blocksRef.current.find((b) => b.id === block.id);
              if (current?.kind === "checklist") replace(block.id, edit(current));
            }}
            focus={focus}
            onFocusHandled={() => setFocus(null)}
            onRequestFocus={setFocus}
            onFocusItem={() => {
              activeBlock.current = block.id;
              setReplaced(null);
            }}
            onLeaveStart={() => focusBlock(blocksRef.current[index - 1])}
            onDraggingChange={onDraggingChange}
          />
        ),
      ])}
      <Pressable accessibilityLabel="Continue writing" onPress={continueAtEnd} className="min-h-24 flex-grow" />
    </View>
  );
}
