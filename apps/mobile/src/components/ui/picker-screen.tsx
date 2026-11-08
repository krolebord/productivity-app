import { type ReactNode, useRef } from "react";
import { KeyboardAvoidingView, Modal, Platform, TextInput, type TextInputInstance } from "react-native";

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
  // A full-screen modal takes the keyboard's field on iOS and doesn't give it back, so the field
  // that had it is refocused once the page is gone. Android's modal window returns it by itself.
  // Read during render: by the time an effect runs, the modal has already taken focus.
  const wasVisible = useRef(false);
  const focusedBefore = useRef<TextInputInstance | null>(null);
  if (visible && !wasVisible.current) {
    focusedBefore.current = TextInput.State.currentlyFocusedInput() as TextInputInstance | null;
  }
  wasVisible.current = visible;
  const refocus = () => {
    focusedBefore.current?.focus();
    focusedBefore.current = null;
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "fullScreen" : undefined}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={Platform.OS === "ios" ? refocus : undefined}
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
