"use no memo";
// Android widgets (react-native-android-widget). Layouts are app JS rendered to RemoteViews, so
// they ship over the air. Only this file and src/widgets/android/ import the library (Biome rule).

import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetTaskHandlerProps,
} from "react-native-android-widget";
import { renderAndroidWidget } from "./android/render";
import { readWidgetSnapshot, writeWidgetSnapshot } from "./android/store";
import { WIDGET_NAMES, type WidgetPublisher, widgetKindForName } from "./kinds";

/**
 * Called from the entry file on every launch, headless ones included.
 *
 * The handler runs whenever Android asks a widget to draw: added, resized, the periodic update, or
 * after a reboot or app update, possibly headless in a cold process. It draws the last published
 * snapshot file right away, then awaits `afterDraw` (the background refresh, which republishes
 * what changed): the headless task, and with it JS timers, lasts until the handler resolves, 30 s
 * at most. Taps are deep links handled natively.
 */
export function registerAndroidWidgets(afterDraw: () => Promise<void>) {
  registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) => {
    if (widgetAction === "WIDGET_DELETED") return;
    const kind = widgetKindForName(widgetInfo.widgetName);
    if (!kind) return;
    renderWidget(renderAndroidWidget(kind, await readWidgetSnapshot(kind), widgetInfo, Date.now()));
    await afterDraw();
  });
}

/** Writes the snapshot file first (later redraws read it), then redraws placed widgets of the kind. */
export const androidWidgetPublisher: WidgetPublisher | null = {
  async publish(kind, snapshot) {
    await writeWidgetSnapshot(kind, snapshot);
    await requestWidgetUpdate({
      widgetName: WIDGET_NAMES[kind],
      renderWidget: (info) => renderAndroidWidget(kind, snapshot, info, Date.now()),
      widgetNotFound: () => {},
    });
  },
};
