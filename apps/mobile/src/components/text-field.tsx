import { TextInput, type TextInputProps } from "react-native";

export function TextField({ className = "", ...props }: TextInputProps) {
  return (
    <TextInput
      className={`h-12 rounded-lg border border-input bg-background px-4 text-base text-foreground ${className}`}
      placeholderTextColorClassName="accent-muted-foreground"
      {...props}
    />
  );
}
