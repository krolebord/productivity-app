import { generateId } from "@sqlite-sync/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActionSheet } from "./ui/action-sheet";
import { IconButton } from "./ui/icon-button";

/**
 * Search and "New" for the tab headers, the mobile counterpart of the web's command palette:
 * search opens the global search screen, "New" a sheet to create a note, task, transaction
 * or habit from any tab. `showNew` is off on Notes, whose own "+" prefills the active filter.
 */
export function GlobalActions({ showNew = true }: { showNew?: boolean }) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <IconButton icon="search" label="Search" onPress={() => router.push("/search")} />
      {showNew && (
        <>
          <IconButton icon="plus" label="New" onPress={() => setNewOpen(true)} />
          <ActionSheet
            visible={newOpen}
            title="New"
            onClose={() => setNewOpen(false)}
            items={[
              {
                label: "Note",
                icon: "file-text",
                onPress: () => router.push({ pathname: "/note/[id]", params: { id: generateId(), draft: "1" } }),
              },
              {
                label: "Task",
                icon: "check-square",
                onPress: () => router.push({ pathname: "/task/[id]", params: { id: generateId(), draft: "1" } }),
              },
              {
                label: "Transaction",
                icon: "credit-card",
                onPress: () => router.push({ pathname: "/transaction/[id]", params: { id: "new" } }),
              },
              {
                label: "Habit",
                icon: "repeat",
                onPress: () => router.push({ pathname: "/habit/[id]", params: { id: "new" } }),
              },
            ]}
          />
        </>
      )}
    </>
  );
}
