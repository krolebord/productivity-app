import type { ComponentProps } from "react";
import { TextInput } from "react-native";
import { cn } from "../../lib/utils";

// Single-line inputs drop the line height that text-* classes add: iOS draws a single-line
// TextInput's text off-center within a taller line box, and typed text and placeholder shift
// differently. Multiline inputs keep it to space wrapped lines.
const singleLine = { lineHeight: undefined };

/** The app's text input: base font size and colors; className overrides them. */
export function Input({ className, multiline, style, ...props }: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      multiline={multiline}
      className={cn("text-base text-foreground", className)}
      placeholderTextColorClassName="accent-muted-foreground"
      style={[!multiline && singleLine, style]}
      {...props}
    />
  );
}
