import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, KeyRound, PlusIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createDynamicValidationLogic, dynamicZodValidators } from "@/lib/form-schemas";
import type { McpTokenAccess } from "@/lib/mcp-token";
import { orpc } from "@/orpc/orpc-client";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog";
import { useAppForm } from "./ui/form";
import { InlineConfirmButton } from "./ui/inline-confirm";

const ACCESS_OPTIONS = [
  { value: "read", label: "Read only" },
  { value: "read-write", label: "Read and write" },
] as const satisfies readonly { value: McpTokenAccess; label: string }[];

const tokenFormSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name.").max(80),
  access: z.enum(["read", "read-write"]),
});

function getMcpUrl() {
  return `${globalThis.location.origin}/mcp`;
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied.`);
  } catch {
    toast.error("Could not copy to clipboard.");
  }
}

function CopyableBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{label}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => copyText(value, label)}>
          <CopyIcon />
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
        {value}
      </pre>
    </div>
  );
}

function CreatedToken({ token, onClose }: { token: string; onClose: () => void }) {
  const url = getMcpUrl();
  return (
    <>
      <DialogTitle>Token created</DialogTitle>
      <DialogDescription>Copy it now. It will not be shown again.</DialogDescription>
      <div className="flex flex-col gap-4">
        <CopyableBlock label="Token" value={token} />
        <CopyableBlock
          label="Claude Code"
          value={`claude mcp add --transport http productivity ${url} --header "Authorization: Bearer ${token}"`}
        />
      </div>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function CreateTokenForm({ onCreated, onClose }: { onCreated: (token: string) => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  const createToken = useMutation(
    orpc.mcp.createToken.mutationOptions({
      onSuccess: ({ token }) => {
        queryClient.invalidateQueries({ queryKey: orpc.mcp.listTokens.key() });
        onCreated(token);
      },
      onError: () => toast.error("Could not create the token. Try again."),
    }),
  );

  const form = useAppForm({
    validationLogic: createDynamicValidationLogic(),
    validators: dynamicZodValidators(tokenFormSchema),
    defaultValues: { name: "", access: "read" as McpTokenAccess },
    onSubmit: ({ value }) => {
      createToken.mutate({ name: value.name.trim(), access: value.access });
    },
  });

  return (
    <>
      <DialogTitle>New MCP token</DialogTitle>
      <DialogDescription>
        Lets an external agent read your notes, accounts, and transactions. Read-write tokens can also change them.
      </DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <form.AppField name="name">
          {(field) => (
            <field.FieldContainer labelText="Name">
              <field.FormInput placeholder="e.g. Claude Code on laptop" autoComplete="off" />
            </field.FieldContainer>
          )}
        </form.AppField>
        <form.AppField name="access">
          {(field) => (
            <field.FieldContainer labelText="Access">
              <field.FormRadioGroup options={ACCESS_OPTIONS} />
            </field.FieldContainer>
          )}
        </form.AppField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createToken.isPending}>
            Create token
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function CreateTokenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const close = () => onOpenChange(false);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setToken(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {open &&
          (token ? (
            <CreatedToken token={token} onClose={close} />
          ) : (
            <CreateTokenForm onCreated={setToken} onClose={close} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

export function McpAccessSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: tokens = [] } = useQuery(orpc.mcp.listTokens.queryOptions());
  const revokeToken = useMutation(
    orpc.mcp.revokeToken.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.mcp.listTokens.key() });
        toast.success("Token revoked.");
      },
      onError: () => toast.error("Could not revoke the token."),
    }),
  );

  return (
    <section className="mt-4 rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h2 className="font-medium">MCP access</h2>
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            Connect external agents to <span className="font-mono">{getMcpUrl()}</span> with a personal access token.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusIcon />
          New token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tokens yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{token.name}</p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {ACCESS_OPTIONS.find((option) => option.value === token.access)?.label ?? token.access} · Created{" "}
                  {formatDistanceToNow(token.createdAt, { addSuffix: true })} ·{" "}
                  {token.lastUsedAt
                    ? `Last used ${formatDistanceToNow(token.lastUsedAt, { addSuffix: true })}`
                    : "Never used"}
                </p>
              </div>
              <InlineConfirmButton
                size="sm"
                aria-label={`Revoke ${token.name}`}
                tooltip="Click again to revoke"
                onConfirm={() => revokeToken.mutateAsync({ id: token.id }).then(() => undefined)}
              >
                <Trash2 />
              </InlineConfirmButton>
            </div>
          ))}
        </div>
      )}

      <CreateTokenDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  );
}
