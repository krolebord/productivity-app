import { useHotkeys } from "@tanstack/react-hotkeys";
import { CheckIcon, TagsIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { formatBalance } from "@/components/account-card";
import { ImportanceBadge, ImportanceSelector } from "@/components/importance-selector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateTimeDisplay } from "@/lib/date-time";
import {
  changeCategoryImportanceDefault,
  IMPORTANCE_TIERS,
  type ImportanceTier,
  type TransactionRow,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { useDb, useDbQuery } from "@/user-db/user-db";

type CategoryImportanceDialogState = {
  isOpen: boolean;
  openRevision: number;
};

export const useCategoryImportanceDialogStore = create(
  combine(
    {
      isOpen: false,
      openRevision: 0,
    } as CategoryImportanceDialogState,
    (set, get) => ({
      close: () => set({ isOpen: false }),
      open: () => set({ isOpen: true, openRevision: get().openRevision + 1 }),
    }),
  ),
);

export function useOpenCategoryImportanceDialog() {
  const open = useCategoryImportanceDialogStore((state) => state.open);
  return useCallback(() => open(), [open]);
}

type DialogMode = "backfill" | "manage";

type CategoryCandidate = {
  category: string;
  count: number;
};

type CategorySummary = CategoryCandidate & {
  inferredImportance: ImportanceTier | null;
  unclassifiedCount: number;
};

type ExampleTransaction = Pick<TransactionRow, "id" | "title" | "amount" | "accountCurrency" | "effectiveAt" | "type">;

const AMOUNT_ACCENT: Record<string, string> = {
  expense: "text-red-600 dark:text-red-400",
  income: "text-emerald-600 dark:text-emerald-400",
  transfer: "text-blue-600 dark:text-blue-400",
  adjustment: "text-amber-600 dark:text-amber-400",
};

function getAdjacentImportance(current: ImportanceTier | null, direction: -1 | 1) {
  if (!current) {
    return direction > 0 ? IMPORTANCE_TIERS[0] : IMPORTANCE_TIERS[IMPORTANCE_TIERS.length - 1];
  }

  const currentIndex = IMPORTANCE_TIERS.indexOf(current);
  const nextIndex = (currentIndex + direction + IMPORTANCE_TIERS.length) % IMPORTANCE_TIERS.length;
  return IMPORTANCE_TIERS[nextIndex];
}

function CategoryExamples({ category }: { category: string }) {
  const { data: exampleTransactions } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select(["id", "title", "amount", "accountCurrency", "effectiveAt", "type"])
      .where("type", "=", "expense")
      .where("category", "=", category || "\u0000")
      .orderBy("effectiveAt", "desc")
      .limit(5),
  );

  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Examples
      </div>
      <div className="min-h-[264px] divide-y">
        {(exampleTransactions as ExampleTransaction[]).map((transaction) => (
          <div key={transaction.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{transaction.title || "Untitled"}</div>
              <div className="text-muted-foreground text-xs">{formatDateTimeDisplay(transaction.effectiveAt)}</div>
            </div>
            <div
              className={cn(
                "self-center font-medium font-mono text-xs tabular-nums",
                AMOUNT_ACCENT[transaction.type] ?? "text-muted-foreground",
              )}
            >
              {formatBalance(Number(transaction.amount), transaction.accountCurrency)}
            </div>
          </div>
        ))}
        {exampleTransactions.length === 0 && (
          <div className="px-3 py-6 text-center text-muted-foreground text-sm">No examples found.</div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
        <CheckIcon className="size-5" />
      </span>
      <div>
        <div className="font-medium">{title}</div>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}

function BackfillCategoryImportanceView({
  categories,
  inferredImportanceByCategory,
  onClose,
}: {
  categories: CategoryCandidate[];
  inferredImportanceByCategory: Map<string, ImportanceTier>;
  onClose: () => void;
}) {
  const db = useDb();
  const [selection, setSelection] = useState<{ category: string; importance: ImportanceTier } | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const clampedIndex = categories.length === 0 ? 0 : Math.min(index, categories.length - 1);
  const current = categories[clampedIndex];
  const currentCategory = current?.category ?? "";
  const selectedImportance =
    selection?.category === currentCategory
      ? selection.importance
      : (inferredImportanceByCategory.get(currentCategory) ?? (current ? "optional" : null));
  const saving = savingCategory === currentCategory;
  const canSave = Boolean(current && selectedImportance && !saving);
  const totalCount = completedCount + categories.length;

  function cycleImportance(direction: -1 | 1) {
    if (!currentCategory || saving) return;
    setSelection({
      category: currentCategory,
      importance: getAdjacentImportance(selectedImportance, direction),
    });
  }

  function saveAndAdvance() {
    if (!current || !selectedImportance || !canSave) return;

    setSavingCategory(current.category);
    try {
      changeCategoryImportanceDefault(
        db.db,
        current.category,
        inferredImportanceByCategory.get(current.category) ?? null,
        selectedImportance,
      );
      setSelection(null);
      setSavingCategory(null);
      setCompletedCount((count) => count + 1);
    } catch (error) {
      setSavingCategory(null);
      toast.error(error instanceof Error ? error.message : "Could not update default importance");
    }
  }

  useHotkeys(
    [
      {
        hotkey: "ArrowLeft",
        callback: () => cycleImportance(-1),
      },
      {
        hotkey: "ArrowRight",
        callback: () => cycleImportance(1),
      },
      {
        hotkey: "Enter",
        callback: () => saveAndAdvance(),
      },
    ],
    {
      conflictBehavior: "allow",
      enabled: Boolean(current),
      preventDefault: true,
      stopPropagation: true,
    },
  );

  useEffect(() => {
    if (index !== clampedIndex) {
      setIndex(clampedIndex);
    }
  }, [clampedIndex, index]);

  if (!current) {
    return (
      <>
        <EmptyState
          title="All categorized expenses are classified"
          description="No categorized expenses need importance backfill."
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-lg">{current.category}</div>
            <div className="text-muted-foreground text-sm">
              {current.count.toLocaleString()} unclassified {current.count === 1 ? "expense" : "expenses"}
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground text-sm tabular-nums">
            {completedCount + 1} of {totalCount}
          </div>
        </div>

        <CategoryExamples category={current.category} />
        <ImportanceSelector
          value={selectedImportance}
          onChange={(importance) => setSelection({ category: current.category, importance })}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!canSave} onClick={saveAndAdvance}>
          {categories.length === 1 ? "Finish" : "Next"}
        </Button>
      </DialogFooter>
    </>
  );
}

function ManageCategoryImportanceView({ categories, onClose }: { categories: CategorySummary[]; onClose: () => void }) {
  const db = useDb();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ category: string; importance: ImportanceTier } | null>(null);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return categories;
    return categories.filter((category) => category.category.toLowerCase().includes(normalizedSearch));
  }, [categories, search]);
  const selectedSummary =
    filteredCategories.find((category) => category.category === selectedCategory) ?? filteredCategories[0];
  const selectedImportance =
    selection?.category === selectedSummary?.category
      ? selection.importance
      : (selectedSummary?.inferredImportance ?? (selectedSummary ? "optional" : null));
  const saving = savingCategory === selectedSummary?.category;
  const canSave = Boolean(
    selectedSummary &&
      selectedImportance &&
      !saving &&
      (selectedImportance !== selectedSummary.inferredImportance || selectedSummary.unclassifiedCount > 0),
  );

  function changeDefault() {
    if (!selectedSummary || !selectedImportance || !canSave) return;

    setSavingCategory(selectedSummary.category);
    try {
      changeCategoryImportanceDefault(
        db.db,
        selectedSummary.category,
        selectedSummary.inferredImportance,
        selectedImportance,
      );
      setSelection(null);
      setSavingCategory(null);
    } catch (error) {
      setSavingCategory(null);
      toast.error(error instanceof Error ? error.message : "Could not update default importance");
    }
  }

  if (categories.length === 0) {
    return (
      <>
        <EmptyState
          title="No categorized expenses found"
          description="Create categorized expenses before managing defaults."
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories" />
          <div className="relative min-h-0 md:flex-1">
            <div className="max-h-80 overflow-y-auto rounded-lg border md:absolute md:inset-0 md:max-h-none">
              {filteredCategories.map((category) => {
                const isActive = category.category === selectedSummary?.category;
                return (
                  <button
                    key={category.category}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(category.category);
                      setSelection(null);
                    }}
                    className={cn(
                      "grid w-full grid-cols-[1fr_auto] gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0",
                      isActive ? "bg-primary/15 ring-1 ring-primary/40 ring-inset" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{category.category}</span>
                      <span className="text-muted-foreground text-xs">
                        {category.count.toLocaleString()} {category.count === 1 ? "expense" : "expenses"}
                        {category.unclassifiedCount > 0
                          ? ` · ${category.unclassifiedCount.toLocaleString()} unclassified`
                          : ""}
                      </span>
                    </span>
                    <ImportanceBadge importance={category.inferredImportance} className="self-center" />
                  </button>
                );
              })}
              {filteredCategories.length === 0 && (
                <div className="px-3 py-6 text-center text-muted-foreground text-sm">No categories found.</div>
              )}
            </div>
          </div>
        </div>

        {selectedSummary ? (
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex h-9 items-center">
              <span className="truncate font-semibold">{selectedSummary.category}</span>
            </div>

            <CategoryExamples category={selectedSummary.category} />
            <ImportanceSelector
              value={selectedImportance}
              onChange={(importance) => setSelection({ category: selectedSummary.category, importance })}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border px-3 py-8 text-muted-foreground text-sm">
            Select a category to manage its default.
          </div>
        )}
      </div>

      <DialogFooter>
        {selectedSummary && !canSave && selectedImportance === selectedSummary.inferredImportance ? (
          <p className="text-muted-foreground text-sm sm:mr-auto">
            Already the current default — pick another tier to change it.
          </p>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button type="button" disabled={!canSave} onClick={changeDefault}>
          {selectedSummary && selectedSummary.unclassifiedCount > 0 ? "Apply to category" : "Change default"}
        </Button>
      </DialogFooter>
    </>
  );
}

function ModeTabs({ mode, onModeChange }: { mode: DialogMode; onModeChange: (mode: DialogMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
      {(["backfill", "manage"] as const).map((nextMode) => (
        <button
          key={nextMode}
          type="button"
          onClick={() => onModeChange(nextMode)}
          className={cn(
            "rounded-md px-2 py-1.5 font-medium text-sm capitalize transition-all",
            mode === nextMode
              ? "bg-background text-foreground shadow-sm dark:bg-input/50"
              : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
          )}
        >
          {nextMode}
        </button>
      ))}
    </div>
  );
}

function CategoryImportanceDialogContent() {
  const closeDialog = useCategoryImportanceDialogStore((state) => state.close);
  const [dialogMode, setDialogMode] = useState<DialogMode>("backfill");
  const [userSelectedMode, setUserSelectedMode] = useState(false);

  const { data: categoryRows } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select((eb) => ["category", eb.fn.count<number>("id").as("count")])
      .where("type", "=", "expense")
      .where("category", "!=", "")
      .where("importance", "is", null)
      .groupBy("category"),
  );

  const { data: allCategoryRows } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select((eb) => ["category", eb.fn.count<number>("id").as("count")])
      .where("type", "=", "expense")
      .where("category", "!=", "")
      .groupBy("category"),
  );

  const { data: importanceRows } = useDbQuery((query) =>
    query
      .selectFrom("transaction_entry")
      .select((eb) => ["category", "importance", eb.fn.count<number>("id").as("count")])
      .where("type", "=", "expense")
      .where("category", "!=", "")
      .where("importance", "is not", null)
      .groupBy(["category", "importance"]),
  );

  const backfillCategories = useMemo<CategoryCandidate[]>(
    () =>
      categoryRows
        .map((row) => ({ category: row.category, count: Number(row.count) }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    [categoryRows],
  );
  const allCategories = useMemo<CategoryCandidate[]>(
    () =>
      allCategoryRows
        .map((row) => ({ category: row.category, count: Number(row.count) }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    [allCategoryRows],
  );
  const unclassifiedCountByCategory = useMemo(
    () => new Map(backfillCategories.map((category) => [category.category, category.count] as const)),
    [backfillCategories],
  );
  const inferredImportanceByCategory = useMemo(() => {
    const best = new Map<string, { importance: ImportanceTier; count: number }>();

    for (const row of importanceRows) {
      if (!row.importance) continue;

      const count = Number(row.count);
      const currentBest = best.get(row.category);
      if (!currentBest || count > currentBest.count) {
        best.set(row.category, { importance: row.importance as ImportanceTier, count });
      }
    }

    return new Map([...best].map(([category, value]) => [category, value.importance] as const));
  }, [importanceRows]);
  const manageCategories = useMemo<CategorySummary[]>(
    () =>
      allCategories.map((category) => ({
        ...category,
        inferredImportance: inferredImportanceByCategory.get(category.category) ?? null,
        unclassifiedCount: unclassifiedCountByCategory.get(category.category) ?? 0,
      })),
    [allCategories, inferredImportanceByCategory, unclassifiedCountByCategory],
  );

  useEffect(() => {
    if (
      !userSelectedMode &&
      dialogMode === "backfill" &&
      backfillCategories.length === 0 &&
      manageCategories.length > 0
    ) {
      setDialogMode("manage");
    }
  }, [backfillCategories.length, dialogMode, manageCategories.length, userSelectedMode]);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <TagsIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <DialogTitle>Update default importance</DialogTitle>
            <DialogDescription className="hidden sm:block">
              {dialogMode === "backfill"
                ? backfillCategories.length > 0
                  ? "Use left/right arrows and Enter to confirm quickly."
                  : "No categorized expenses need importance backfill."
                : manageCategories.length > 0
                  ? "Search a category and change its inferred default."
                  : "No categorized expenses found."}
            </DialogDescription>
          </div>
        </div>
      </div>

      <ModeTabs
        mode={dialogMode}
        onModeChange={(mode) => {
          setUserSelectedMode(true);
          setDialogMode(mode);
        }}
      />

      {dialogMode === "backfill" ? (
        <BackfillCategoryImportanceView
          categories={backfillCategories}
          inferredImportanceByCategory={inferredImportanceByCategory}
          onClose={closeDialog}
        />
      ) : (
        <ManageCategoryImportanceView categories={manageCategories} onClose={closeDialog} />
      )}
    </>
  );
}

export function CategoryImportanceDialog() {
  const isOpen = useCategoryImportanceDialogStore((state) => state.isOpen);
  const openRevision = useCategoryImportanceDialogStore((state) => state.openRevision);
  const closeDialog = useCategoryImportanceDialogStore((state) => state.close);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
        {isOpen && <CategoryImportanceDialogContent key={openRevision} />}
      </DialogContent>
    </Dialog>
  );
}
