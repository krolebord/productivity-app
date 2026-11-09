// Non-iOS stand-in for ios-widgets.ios.tsx, so other platforms never bundle expo-widgets or @expo/ui.
import type { WidgetPublisher } from "./kinds";

export const iosWidgetPublisher: WidgetPublisher | null = null;
