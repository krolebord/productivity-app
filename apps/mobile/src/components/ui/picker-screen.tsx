import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform } from "react-native";

/**
 * A full-screen picker page over the current screen, for picks that scroll or take typing (tags,
 * searchable lists, filter panels; see docs/design-principles.md). Unlike a sheet it has no swipe
 * to close, so scrolling never dismisses it, and lists can stay clear of the keyboard. Closes with
 * the back button in its content's `ScreenHeader` (`onBack`) or Android's back.
 *
 * A component rather than a route, so `value`/`onChange` stay typed props: render it next to its
 * trigger and drive it with `visible`. Its children mount only while it's open, so keep the
 * picker's state and queries in a component inside it: they reset and stop on close. Lists in it
 * set `automaticallyAdjustKeyboardInsets` (iOS; Android is padded by the screen) and pad their
 * bottom by the safe-area inset.
 */
export function PickerScreen({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "fullScreen" : undefined}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Android doesn't resize an edge-to-edge modal for the keyboard, so pad it here; on iOS the
          lists inset themselves (`automaticallyAdjustKeyboardInsets`) and scroll under it. */}
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === "android" ? "padding" : undefined}
        enabled={Platform.OS === "android"}
      >
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}
