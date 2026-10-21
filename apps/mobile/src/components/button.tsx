import { ActivityIndicator, Pressable, Text } from "react-native";

const VARIANTS = {
  primary: { container: "bg-primary", label: "text-primary-foreground", spinner: "accent-primary-foreground" },
  ghost: { container: "bg-transparent", label: "text-foreground", spinner: "accent-foreground" },
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: keyof typeof VARIANTS;
};

export function Button({ label, onPress, loading = false, disabled = false, variant = "primary" }: ButtonProps) {
  const styles = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-12 flex-row items-center justify-center rounded-lg px-4 active:opacity-80 disabled:opacity-50 ${styles.container}`}
    >
      {loading ? (
        <ActivityIndicator colorClassName={styles.spinner} />
      ) : (
        <Text className={`font-medium text-base ${styles.label}`}>{label}</Text>
      )}
    </Pressable>
  );
}
