// Non-Android stand-in for android-widgets.android.tsx, so other platforms never bundle
// react-native-android-widget.
import type { WidgetPublisher } from "./kinds";

export function registerAndroidWidgets(_afterDraw: () => Promise<void>) {}

export const androidWidgetPublisher: WidgetPublisher | null = null;
