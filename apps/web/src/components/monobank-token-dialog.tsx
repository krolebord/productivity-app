import { createDynamicValidationLogic, dynamicZodValidators } from "@productivity/core/form-schemas";
import { useMutation } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { orpc } from "@/orpc/orpc-client";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog";
import { useAppForm } from "./ui/form";

const tokenFormSchema = z.object({
  token: z.string().trim().min(20, "That does not look like a valid Monobank token."),
});

type MonobankTokenDialogMode = "connect" | "replace";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function MonobankTokenDialogContent({ mode, onClose }: { mode: MonobankTokenDialogMode; onClose: () => void }) {
  const connect = useMutation(orpc.integrations.monobank.connect.mutationOptions());
  const replaceToken = useMutation(orpc.integrations.monobank.replaceToken.mutationOptions());
  const mutation = mode === "connect" ? connect : replaceToken;

  const form = useAppForm({
    validationLogic: createDynamicValidationLogic(),
    validators: dynamicZodValidators(tokenFormSchema),
    defaultValues: { token: "" },
    onSubmit: ({ value }) => {
      mutation.mutate(
        { token: value.token.trim() },
        {
          onSuccess: () => {
            toast.success(mode === "connect" ? "Monobank connected." : "Monobank token replaced.");
            onClose();
          },
          onError: (error) => {
            toast.error(getErrorMessage(error, "Something went wrong. Try again."));
          },
        },
      );
    },
  });

  return (
    <>
      <DialogTitle>{mode === "connect" ? "Connect Monobank" : "Replace Monobank token"}</DialogTitle>
      <DialogDescription>
        Create a personal Monobank API token, paste it here, and we will use it to receive new transaction webhooks. The
        token is stored on the server.
      </DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <form.AppField name="token">
          {(field) => (
            <field.FieldContainer labelText="Personal token">
              <field.FormInput placeholder="Paste your Monobank token" autoComplete="off" spellCheck={false} />
            </field.FieldContainer>
          )}
        </form.AppField>

        <a
          href="https://api.monobank.ua/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3.5" />
          Get token
        </a>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mode === "connect" ? "Connect" : "Replace token"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function MonobankTokenDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: MonobankTokenDialogMode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <MonobankTokenDialogContent mode={mode} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
