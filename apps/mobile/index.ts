// App entry (package.json "main"). Widget registration has to happen at module load on every
// launch, next to expo-router's entry: Android starts this bundle headless to redraw widgets, and
// on iOS createWidget() stores each layout in App Group defaults, which is how layout changes
// ship over the air. See docs/widgets.md.
import "expo-router/entry";
import { registerAndroidWidgets } from "./src/widgets/android-widgets";
import "./src/widgets/ios-widgets";

registerAndroidWidgets();
