import { useImportedProviderIds } from "@productivity/core/data/transactions";
import type { MonobankImportEntry } from "@productivity/core/monobank/mapping";
import { MONOBANK_PROVIDER_TYPE } from "@productivity/core/monobank/types";
import { useDb } from "@productivity/core/user-db/db-context";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { importMonobankStatementItems } from "@/lib/monobank/import-client";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc/orpc-client";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function StatementList({
  providerAccountId,
  currency,
  onClose,
}: {
  providerAccountId: string;
  currency: string;
  onClose: () => void;
}) {
  const db = useDb();
  const {
    data: statement,
    error: statementError,
    isError: statementIsError,
    isLoading: statementIsLoading,
    refetch: refetchStatement,
  } = useQuery(
    orpc.integrations.monobank.getRecentStatement.queryOptions({
      input: { providerAccountId },
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    }),
  );

  const importedRows = useImportedProviderIds(MONOBANK_PROVIDER_TYPE);
  const importedIds = useMemo(
    () => new Set(importedRows.map((row) => row.providerId).filter((id): id is string => id !== null)),
    [importedRows],
  );

  const entries = statement?.entries ?? [];
  const rows = useMemo(
    () => entries.map((entry) => ({ entry, alreadyImported: importedIds.has(entry.providerId) })),
    [entries, importedIds],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set(rows.filter((row) => !row.alreadyImported).map((row) => row.entry.providerId)));
  }, [rows]);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function handleImport() {
    const chosen = rows.filter((row) => selected.has(row.entry.providerId)).map((row) => row.entry);
    try {
      const imported = importMonobankStatementItems(db.db, providerAccountId, chosen);
      toast.success(`Imported ${imported} transaction${imported === 1 ? "" : "s"}.`);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not import transactions."));
    }
  }

  if (statementIsLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (statementIsError) {
    return (
      <div className="flex flex-col gap-3 py-4">
        <p className="text-rose-600 text-sm dark:text-rose-400">
          {getErrorMessage(statementError, "Could not fetch transactions.")}
        </p>
        <Button variant="outline" onClick={() => refetchStatement()}>
          Try again
        </Button>
      </div>
    );
  }

  const newCount = rows.filter((row) => !row.alreadyImported).length;
  const allSelected = newCount > 0 && selected.size === newCount;

  function setAllSelected(select: boolean) {
    setSelected(
      select ? new Set(rows.filter((row) => !row.alreadyImported).map((row) => row.entry.providerId)) : new Set(),
    );
  }

  return (
    <>
      {newCount > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {rows.length} transaction{rows.length === 1 ? "" : "s"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAllSelected(!allSelected)}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>
      ) : null}

      <div className="max-h-80 overflow-y-auto rounded-lg border">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-muted-foreground text-sm">No recent transactions found.</p>
        ) : (
          rows.map(({ entry, alreadyImported }) => (
            <StatementRow
              key={entry.providerId}
              entry={entry}
              currency={currency}
              alreadyImported={alreadyImported}
              checked={selected.has(entry.providerId)}
              onCheckedChange={(checked) => toggle(entry.providerId, checked)}
            />
          ))
        )}
      </div>

      <DialogFooter className="sm:items-center sm:justify-between">
        <span className="text-muted-foreground text-xs">
          {selected.size} selected · {newCount} new · {rows.length - newCount} imported
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleImport} disabled={selected.size === 0}>
            Import {selected.size > 0 ? selected.size : ""}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function StatementRow({
  entry,
  currency,
  alreadyImported,
  checked,
  onCheckedChange,
}: {
  entry: MonobankImportEntry;
  currency: string;
  alreadyImported: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const checkboxId = `mono-stmt-${entry.providerId}`;

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        "flex items-center gap-3 border-b px-3 py-2 last:border-b-0",
        alreadyImported ? "cursor-default opacity-60" : "cursor-pointer",
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={!alreadyImported && checked}
        disabled={alreadyImported}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{entry.title || "Transaction"}</p>
        <p className="text-muted-foreground text-xs">
          {new Date(entry.effectiveAt).toLocaleDateString()}
          {alreadyImported ? " · Imported" : ""}
        </p>
      </div>
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          entry.amount < 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {entry.amount.toFixed(2)} {currency}
      </span>
    </label>
  );
}

export function MonobankBackfillDialog({
  open,
  onOpenChange,
  providerAccountId,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerAccountId: string;
  currency: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Import recent transactions</DialogTitle>
        <DialogDescription>
          The latest transactions from Monobank (up to ~31 days). Importing adjusts the linked account balance.
        </DialogDescription>
        {open && (
          <StatementList
            providerAccountId={providerAccountId}
            currency={currency}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
