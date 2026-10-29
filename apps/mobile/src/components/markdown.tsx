import { useMemo } from "react";
import { Linking, type ViewStyle } from "react-native";
import {
  EnrichedMarkdownText,
  type MarkdownStyle,
  type Md4cFlags,
  type TaskListItemPressEvent,
} from "react-native-enriched-markdown";
import remend from "remend";
import { useCSSVariable } from "uniwind";

const COLOR_VARS = [
  "--color-foreground",
  "--color-muted-foreground",
  "--color-muted",
  "--color-border",
  "--color-primary",
  "--color-primary-foreground",
  "--color-accent-foreground",
];

// `$` is common in finance notes, so don't parse it as LaTeX (math isn't compiled in anyway).
// Admonitions (`> [!NOTE]`) stay plain quotes, as on web.
const MD4C_FLAGS: Md4cFlags = { latexMath: false, admonitions: false };

const FONT_SIZE = 16;
const LINE_HEIGHT = 24;

function markdownStyle([foreground, mutedForeground, muted, border, primary, primaryForeground, accentForeground]: (
  | string
  | undefined
)[]): MarkdownStyle {
  const heading = (fontSize: number) => ({
    fontSize,
    fontWeight: "600",
    color: foreground,
    lineHeight: Math.round(fontSize * 1.3),
    marginTop: 12,
    marginBottom: 4,
  });
  return {
    paragraph: { fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: foreground, marginTop: 0, marginBottom: 8 },
    h1: heading(22),
    h2: heading(19),
    h3: heading(17),
    h4: heading(FONT_SIZE),
    h5: heading(FONT_SIZE),
    h6: heading(FONT_SIZE),
    list: {
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      color: foreground,
      marginBottom: 8,
      bulletColor: mutedForeground,
      markerColor: mutedForeground,
      gapWidth: 8,
      marginLeft: 20,
    },
    taskList: {
      checkedColor: primary,
      borderColor: mutedForeground,
      checkmarkColor: primaryForeground,
      checkboxSize: 17,
      checkboxBorderRadius: 4,
      checkedTextColor: mutedForeground,
      checkedStrikethrough: true,
    },
    blockquote: {
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      color: mutedForeground,
      backgroundColor: "transparent",
      borderColor: border,
      borderWidth: 2,
      gapWidth: 12,
      marginBottom: 8,
    },
    link: { color: primary, underline: true },
    strong: { color: foreground },
    em: { color: foreground },
    code: { fontSize: FONT_SIZE * 0.875, color: accentForeground, backgroundColor: muted, borderColor: border },
    codeBlock: {
      fontSize: 14,
      lineHeight: 20,
      color: foreground,
      backgroundColor: muted,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    table: {
      fontSize: 14,
      color: foreground,
      borderColor: border,
      borderRadius: 8,
      headerBackgroundColor: muted,
      headerTextColor: foreground,
      rowEvenBackgroundColor: "transparent",
      rowOddBackgroundColor: "transparent",
      cellPaddingHorizontal: 10,
      cellPaddingVertical: 6,
      marginBottom: 8,
    },
    thematicBreak: { color: border, height: 1, marginTop: 8, marginBottom: 12 },
    image: { borderRadius: 8, marginBottom: 8 },
  };
}

export type MarkdownTaskToggle = { index: number; checked: boolean; text: string };

/**
 * Native GitHub-flavored markdown in the app's typography and light/dark tokens.
 * Links open in the system browser. Task list checkboxes are tappable only when
 * `onToggleTask` is set; it receives the renderer's task index (counted per text
 * segment), the item's text and its new state, which core's setMarkdownTaskChecked
 * maps back to the source line.
 */
export function Markdown({
  markdown,
  onToggleTask,
  streaming = false,
  style,
}: {
  markdown: string;
  onToggleTask?: (task: MarkdownTaskToggle) => void;
  /** The text is still arriving: close dangling syntax (`**bo`) so it doesn't flash as literal markers. */
  streaming?: boolean;
  style?: ViewStyle;
}) {
  const colors = useCSSVariable(COLOR_VARS) as (string | undefined)[];
  const colorKey = colors.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: colorKey stands in for the colors array, which is new on every render.
  const resolvedStyle = useMemo(() => markdownStyle(colors), [colorKey]);
  const source = useMemo(
    () => (streaming ? remend(markdown, { linkMode: "text-only", images: false, katex: false }) : markdown),
    [markdown, streaming],
  );

  return (
    <EnrichedMarkdownText
      flavor="github"
      markdown={source}
      markdownStyle={resolvedStyle}
      md4cFlags={MD4C_FLAGS}
      containerStyle={style}
      onLinkPress={({ url }) => {
        Linking.openURL(url).catch(() => {});
      }}
      enableTaskListItemToggle={onToggleTask != null}
      onTaskListItemPress={({ index, checked, text }: TaskListItemPressEvent) =>
        onToggleTask?.({ index, checked, text })
      }
      streamingAnimation={streaming}
    />
  );
}
