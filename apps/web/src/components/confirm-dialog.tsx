import { useHotkey } from "@tanstack/react-hotkeys";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export const useConfirmDialogStore = create(
  combine(
    {
      options: null as ConfirmDialogOptions | null,
    },
    (set) => ({
      confirm: (options: ConfirmDialogOptions) => {
        set({ options });
      },
      close: () => {
        set({ options: null });
      },
    }),
  ),
);

export function ConfirmDialog() {
  const { options, close } = useConfirmDialogStore();

  function confirm() {
    options?.onConfirm();
    close();
  }

  useHotkey("Enter", confirm, { enabled: options !== null });

  return (
    <Dialog
      open={options !== null}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          <DialogDescription>{options?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="border-ring ring-[3px] ring-destructive/20 dark:ring-destructive/40"
            onClick={confirm}
          >
            {options?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
