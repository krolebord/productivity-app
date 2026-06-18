import { useHotkey } from "@tanstack/react-hotkeys";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
  onConfirm: () => Promise<void> | void;
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
  const mutation = useMutation({
    mutationFn: async () => {
      await options?.onConfirm();
    },
    onSuccess: () => {
      close();
    },
  });

  useHotkey(
    "Enter",
    () => {
      mutation.mutate();
    },
    { enabled: options !== null && !mutation.isPending },
  );

  return (
    <Dialog
      open={options !== null}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
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
          <Button variant="outline" onClick={close} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="border-ring ring-[3px] ring-destructive/20 dark:ring-destructive/40"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {options?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
