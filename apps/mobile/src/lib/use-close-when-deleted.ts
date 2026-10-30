import { useEffect, useRef } from "react";
import { Alert } from "react-native";

/**
 * Closes an editor once its row, after having been seen, disappears: it was deleted elsewhere
 * (e.g. on another device), and saves would be refused from then on. A row that was never seen
 * is a new draft not saved yet. Call `expectDeletion()` before the editor deletes the row itself.
 */
export function useCloseWhenDeleted(row: unknown, { message, onClose }: { message: string; onClose: () => void }) {
  const seen = useRef(!!row);
  if (row) seen.current = true;
  const expected = useRef(false);
  const deleted = !row && seen.current && !expected.current;

  // biome-ignore lint/correctness/useExhaustiveDependencies: react to the deletion only.
  useEffect(() => {
    if (!deleted) return;
    onClose();
    Alert.alert(message);
  }, [deleted]);

  return {
    expectDeletion: () => {
      expected.current = true;
    },
  };
}
