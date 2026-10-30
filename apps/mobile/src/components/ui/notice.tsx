import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { RefreshStatus } from "../../lib/use-finance-refresh";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

const SUCCESS_VISIBLE_MS = 4000;

/**
 * Inline progress and result for an action the user started (the app has no toasts): a spinner
 * while pending, a confirmation that clears itself, or an error with a retry.
 */
export function StatusNotice({
  status,
  pendingLabel,
  onRetry,
  onDismiss,
}: {
  status: RefreshStatus;
  pendingLabel: string;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (status.state !== "success") return;
    const timeout = setTimeout(onDismiss, SUCCESS_VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [status, onDismiss]);

  if (status.state === "idle") return null;

  const error = status.state === "error";
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn(
        "min-h-11 flex-row items-center gap-2.5 rounded-lg border px-3 py-2",
        error ? "border-rose-500/30 bg-rose-50 dark:bg-rose-950/40" : "border-border bg-card",
      )}
    >
      {status.state === "pending" ? (
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
      ) : (
        <Icon
          name={error ? "alert-circle" : "check-circle"}
          size={16}
          colorClassName={error ? "accent-rose-600 dark:accent-rose-400" : "accent-emerald-600 dark:accent-emerald-400"}
        />
      )}
      <Text className={cn("flex-1 text-sm", error ? "text-rose-700 dark:text-rose-300" : "text-foreground")}>
        {status.state === "pending" ? pendingLabel : status.message}
      </Text>
      {error && onRetry && (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} className="active:opacity-60">
          <Text className="font-medium text-rose-700 text-sm dark:text-rose-300">Retry</Text>
        </Pressable>
      )}
      {status.state !== "pending" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={8}
          className="active:opacity-60"
        >
          <Icon name="x" size={16} colorClassName="accent-muted-foreground" />
        </Pressable>
      )}
    </View>
  );
}
