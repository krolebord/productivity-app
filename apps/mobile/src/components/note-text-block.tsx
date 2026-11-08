import { compactRichBlocks, isRichEditable, separateRichBlocks, type TextBlock } from "@productivity/core/note-blocks";
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, Text, type TextInputInstance } from "react-native";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type MarkdownTextInputStyle,
} from "react-native-enriched-markdown";
import { useCSSVariable } from "uniwind";
import { Markdown } from "./markdown";
import { Input } from "./ui/input";

export type NoteTextBlockHandle = { focus: () => void };

const FONT_SIZE = 16;
const LINE_HEIGHT = 24;

/**
 * A text block of a note. Markdown the rich input can hold edits as formatted text; anything
 * else (code, quotes, tables…) shows rendered and turns into raw markdown on tap. Either way
 * `onChange` only fires for the user's edits, never for how the input re-serializes on load.
 */
export function NoteTextBlock({
  ref,
  block,
  placeholder,
  onChange,
  onFocus,
}: {
  ref?: Ref<NoteTextBlockHandle>;
  block: TextBlock;
  placeholder?: string;
  onChange: (body: string) => void;
  onFocus: () => void;
}) {
  // Decided once per block: switching editors mid-edit would lose the cursor.
  const [rich] = useState(() => isRichEditable(block.body));
  return rich ? (
    <RichText ref={ref} body={block.body} placeholder={placeholder} onChange={onChange} onFocus={onFocus} />
  ) : (
    <RawText ref={ref} body={block.body} onChange={onChange} onFocus={onFocus} />
  );
}

function RichText({
  ref,
  body,
  placeholder,
  onChange,
  onFocus,
}: {
  ref?: Ref<NoteTextBlockHandle>;
  body: string;
  placeholder?: string;
  onChange: (body: string) => void;
  onFocus: () => void;
}) {
  const input = useRef<EnrichedMarkdownTextInputInstance>(null);
  // What the input loads, computed once: it only reads its value on mount.
  const [initial] = useState(() => compactRichBlocks(body));
  // The input re-serializes the markdown it was given (e.g. `*a*` as `_a_`). That isn't an
  // edit, so changes only count once the user has focused the input, and only when they
  // differ from what it held at that moment.
  const baseline = useRef<string | null>(null);
  const focused = useRef(false);
  const [foreground, mutedForeground, primary] = useCSSVariable([
    "--color-foreground",
    "--color-muted-foreground",
    "--color-primary",
  ]) as (string | undefined)[];
  const markdownStyle = useMemo<MarkdownTextInputStyle>(
    () => ({
      h1: { fontSize: 22, fontWeight: "600", color: foreground },
      h2: { fontSize: 19, fontWeight: "600", color: foreground },
      h3: { fontSize: 17, fontWeight: "600", color: foreground },
      h4: { fontSize: FONT_SIZE, fontWeight: "600", color: foreground },
      h5: { fontSize: FONT_SIZE, fontWeight: "600", color: foreground },
      h6: { fontSize: FONT_SIZE, fontWeight: "600", color: foreground },
      link: { color: primary, underline: true },
      list: { itemSpacing: 2 },
    }),
    [foreground, primary],
  );

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));
  // What the input holds once it has parsed `body`, in its own serialization. Setting that
  // back also makes Android re-measure the input: its first measure misses the heading sizes
  // and cuts off the last lines.
  useEffect(() => {
    input.current?.getMarkdown().then((markdown) => {
      if (focused.current) return;
      baseline.current = markdown;
      input.current?.setValue(initial);
    });
  }, [initial]);

  return (
    <EnrichedMarkdownTextInput
      ref={input}
      defaultValue={initial}
      placeholder={placeholder}
      placeholderTextColor={mutedForeground}
      cursorColor={primary}
      scrollEnabled={false}
      markdownShortcuts
      markdownStyle={markdownStyle}
      // Markdown has no underline, and spoilers aren't markdown the web understands.
      formatMenuConfig={{ underline: { enabled: false }, spoiler: { enabled: false } }}
      onFocus={() => {
        focused.current = true;
        onFocus();
      }}
      onChangeMarkdown={(markdown) => {
        // Before any focus it's the load's re-serialization, not an edit.
        if (!focused.current) {
          baseline.current = markdown;
          return;
        }
        if (markdown === baseline.current) return;
        baseline.current = markdown;
        onChange(separateRichBlocks(markdown));
      }}
      // No lineHeight: a fixed one is shorter than headings and list rows, which then overlap.
      style={{ fontSize: FONT_SIZE, color: foreground, padding: 0, minHeight: LINE_HEIGHT }}
    />
  );
}

/** Rendered markdown that becomes its raw source while being edited. */
function RawText({
  ref,
  body,
  onChange,
  onFocus,
}: {
  ref?: Ref<NoteTextBlockHandle>;
  body: string;
  onChange: (body: string) => void;
  onFocus: () => void;
}) {
  const [value, setValue] = useState(body);
  const [editing, setEditing] = useState(false);
  const input = useRef<TextInputInstance>(null);
  useImperativeHandle(ref, () => ({ focus: () => (editing ? input.current?.focus() : setEditing(true)) }));

  if (editing) {
    return (
      <Input
        ref={input}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          onChange(text);
        }}
        onFocus={onFocus}
        onBlur={() => setEditing(false)}
        autoFocus
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        className="font-mono text-sm"
      />
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Edits the markdown" onPress={() => setEditing(true)}>
      {value.trim() ? (
        <Markdown markdown={value} />
      ) : (
        <Text className="text-base text-muted-foreground">Tap to write…</Text>
      )}
    </Pressable>
  );
}
