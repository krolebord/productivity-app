import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

/**
 * Closes an editor once its row, after having been seen, disappears: it was deleted elsewhere
 * (e.g. on another device), and saves would be refused from then on. A row that was never seen
 * is a new draft not saved yet. Call `expectDeletion()` before the editor deletes the row itself.
 */
export function useCloseWhenDeleted(row: unknown, { message, onClose }: { message: string; onClose: () => void }) {
  const [seen, setSeen] = useState(!!row);
  if (row && !seen) setSeen(true);
  const expected = useRef(false);
  const gone = !row && seen;

  // biome-ignore lint/correctness/useExhaustiveDependencies: react to the deletion only.
  useEffect(() => {
    if (!gone || expected.current) return;
    onClose();
    Alert.alert(message);
  }, [gone]);

  return {
    expectDeletion: () => {
      expected.current = true;
    },
  };
}
