import type { ComponentProps } from "react";
import { Switch as NativeSwitch, Platform } from "react-native";

/**
 * The app's switch, in theme colors. Android otherwise paints the thumb with the
 * platform accent (teal), so it gets white when on and muted when off, like Material.
 */
export function Switch(props: ComponentProps<typeof NativeSwitch>) {
  return (
    <NativeSwitch
      trackColorOnClassName="accent-primary"
      trackColorOffClassName="accent-input"
      ios_backgroundColorClassName="accent-input"
      thumbColorClassName={
        Platform.OS === "android" ? (props.value ? "accent-primary-foreground" : "accent-muted-foreground") : undefined
      }
      {...props}
    />
  );
}
