import { generateId } from "@sqlite-sync/core";
import { createFileRoute } from "@tanstack/react-router";
import { Brain, PlusIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { useConfirmDialogStore } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MEMORY_INJECTION_LIMIT, type MemoryItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

export const Route = createFileRoute("/_app/memories")({
  component: MemoriesPage,
});

type MemoryRow = Pick<MemoryItem, "id" | "content" | "source" | "enabled" | "createdAt">;

function MemoryCard({ memory }: { memory: MemoryRow }) {
  const db = useDb();
  const confirm = useConfirmDialogStore((s) => s.confirm);
  const [draft, setDraft] = useState(() => memory.content);

  function saveContent() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === memory.content) {
      setDraft(memory.content);
      return;
    }
    db.db.executeKysely((q) =>
      q.updateTable("memory").set({ content: trimmed, updatedAt: Date.now() }).where("id", "=", memory.id),
    );
  }

  function setEnabled(enabled: boolean) {
    db.db.executeKysely((q) =>
      q.updateTable("memory").set({ enabled, updatedAt: Date.now() }).where("id", "=", memory.id),
    );
  }

  function remove() {
    confirm({
      title: "Delete memory",
      description: "The assistant will no longer remember this. This cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: () => {
        db.db.executeKysely((q) => q.deleteFrom("memory").where("id", "=", memory.id));
      },
    });
  }

  return (
    <div className={cn("rounded-lg border bg-card p-3 transition-opacity", !memory.enabled && "opacity-60")}>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={saveContent}
        rows={2}
        className="min-h-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        placeholder="Memory content…"
      />
      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
          {memory.source === "assistant" ? "Assistant" : "You"}
        </span>
        <div className="flex items-center gap-3">
          <label
            htmlFor={`memory-enabled-${memory.id}`}
            className="flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs"
          >
            <Checkbox
              id={`memory-enabled-${memory.id}`}
              checked={memory.enabled}
              onCheckedChange={(value) => setEnabled(value === true)}
            />
            Enabled
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            aria-label="Delete memory"
            onClick={remove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MemoriesPage() {
  const db = useDb();
  const [draft, setDraft] = useState("");

  const { data: memories } = useDbQuery((db) =>
    db.selectFrom("memory").select(["id", "content", "source", "enabled", "createdAt"]).orderBy("createdAt", "desc"),
  );

  const enabledCount = memories.filter((m) => m.enabled).length;
  const overCap = enabledCount > MEMORY_INJECTION_LIMIT;

  function addMemory() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const now = Date.now();
    db.db.executeKysely((q) =>
      q.insertInto("memory").values({
        id: generateId(),
        content: trimmed,
        source: "user",
        enabled: true,
        createdAt: now,
        updatedAt: now,
        tombstone: false,
      }),
    );
    setDraft("");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-2">
        <h1 className="font-semibold text-xl">Memories</h1>
        <p className="text-muted-foreground text-sm">
          Durable notes the assistant keeps about you. Every enabled memory is shared with the assistant in each chat.
        </p>
      </div>

      <div className="mb-4 rounded-lg border bg-card p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addMemory();
            }
          }}
          rows={2}
          placeholder="Add something the assistant should remember…"
          className="min-h-0 resize-none"
        />
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" onClick={addMemory} disabled={!draft.trim()}>
            <PlusIcon />
            Add memory
          </Button>
        </div>
      </div>

      {overCap && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400">
          You have {enabledCount} enabled memories. Only the newest {MEMORY_INJECTION_LIMIT} are shared with the
          assistant — disable or delete some to stay under the limit.
        </div>
      )}

      {memories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <Brain className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No memories yet</p>
            <p className="text-muted-foreground text-sm">
              Add one above, or just tell the assistant something worth remembering.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </div>
      )}
    </div>
  );
}
