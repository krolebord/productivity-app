import type { ComponentProps } from "react";
import { Platform, TextInput, type TextStyle } from "react-native";
import { cn } from "../../lib/utils";

// Single-line inputs drop the line height that text-* classes add: iOS draws a single-line
// TextInput's text off-center within a taller line box, and typed text and placeholder shift
// differently. Multiline inputs keep it to space wrapped lines.
// Android also pads the line box past the font's ascent and descent, and the cursor spans that
// whole box, so it hangs below the text; dropping the padding and centering the line fixes it.
// Both props are Android-only, so iOS is unaffected.
const singleLine: TextStyle = {
  lineHeight: undefined,
  ...Platform.select<TextStyle>({ android: { includeFontPadding: false, textAlignVertical: "center" } }),
};

// tracking-normal sets letter spacing explicitly. React Native reuses native text inputs across
// screens, and one that never sets it keeps the last value: the sign-in code field's 8px spacing
// reappeared on the Today quick-add field after signing in.

/** The app's text input: base font size and colors; className overrides them. */
export function Input({ className, multiline, style, ...props }: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      multiline={multiline}
      className={cn("text-base text-foreground tracking-normal", className)}
      placeholderTextColorClassName="accent-muted-foreground"
      style={[!multiline && singleLine, style]}
      {...props}
    />
  );
}
