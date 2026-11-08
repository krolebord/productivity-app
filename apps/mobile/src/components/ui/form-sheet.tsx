import { createContext, useContext, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { type FormSheetProps, FormSheet as NativeFormSheet } from "react-native-screens/experimental";
import { useCSSVariable } from "uniwind";

const InFormSheet = createContext(false);

/** True inside a FormSheet, which starts below the status bar, so headers skip the top inset. */
export function useInFormSheet() {
  return useContext(InFormSheet);
}

/**
 * Android's grabber is Material's 48dp drag handle, which the library stacks above the content
 * inside the height it measured for the content alone, cutting off that much of its bottom.
 */
const ANDROID_GRABBER_HEIGHT = 48;

/**
 * A native form sheet (UISheetPresentationController on iOS, a bottom sheet on Android) sized to
 * its content and driven by `isOpen`, for short picks that fit on screen without scrolling or
 * typing (see docs/design-principles.md; longer ones use PickerScreen). Wraps react-native-screens'
 * experimental FormSheet, which may change in any release: keep its version pinned and recheck
 * sheets on both platforms when bumping it. On iOS it needs the "gamma" sources, which
 * plugins/rns-gamma.js turns on at `pod install`.
 *
 * Render it unconditionally and flip `isOpen`; sync `onNativeDismiss` (swipe down, backdrop tap,
 * Android back) back into that state. Children need no bottom safe area: both platforms add it.
 *
 * Children mount only while the sheet is open (kept until it finishes closing): on iOS, content
 * mounted together with the sheet reports its size before the sheet listens, so the sheet never
 * learns its height and opens full screen (react-native-screens 4.29–4.30).
 */
export function FormSheet({
  prefersGrabberVisible = true,
  preferredCornerRadius = 24,
  nativeContainerStyle,
  onDidDisappear,
  children,
  ...props
}: Omit<FormSheetProps, "detents">) {
  const background = useCSSVariable("--color-background") as string | undefined;

  // Set during render, not in an effect, so the content arrives in the same commit as `isOpen`.
  const [mounted, setMounted] = useState(props.isOpen);
  if (props.isOpen && !mounted) setMounted(true);

  const grabber = Platform.OS === "android" && prefersGrabberVisible ? ANDROID_GRABBER_HEIGHT : 0;

  return (
    <NativeFormSheet
      prefersGrabberVisible={prefersGrabberVisible}
      preferredCornerRadius={preferredCornerRadius}
      nativeContainerStyle={nativeContainerStyle ?? { backgroundColor: background }}
      detents="fitToContents"
      onDidDisappear={(event) => {
        if (!props.isOpen) setMounted(false);
        onDidDisappear?.(event);
      }}
      {...props}
    >
      {/* Like RN's Modal: lists inside the sheet don't count as nested in a ScrollView it's
          rendered from (which would warn and break their windowing). */}
      <ScrollView.Context.Provider value={null}>
        <InFormSheet.Provider value={true}>
          {mounted && (
            <View className="bg-background" style={{ paddingBottom: 8 + grabber }}>
              {children}
            </View>
          )}
        </InFormSheet.Provider>
      </ScrollView.Context.Provider>
    </NativeFormSheet>
  );
}
