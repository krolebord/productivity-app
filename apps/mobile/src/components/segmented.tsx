import { Pressable, Text, View } from "react-native";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-lg bg-muted p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`h-8 flex-1 items-center justify-center rounded-md ${selected ? "bg-background shadow-sm" : ""}`}
          >
            <Text
              numberOfLines={1}
              className={`font-medium text-sm ${selected ? "text-foreground" : "text-muted-foreground"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
