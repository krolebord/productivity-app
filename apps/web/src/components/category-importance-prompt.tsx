import { useUnclassifiedExpenseCount } from "@productivity/core/data/transactions";
import { IMPORTANCE_PROMPT_THRESHOLD } from "@productivity/core/finance/category-importance";
import { InfoIcon, TagsIcon } from "lucide-react";
import { useOpenCategoryImportanceDialog } from "@/components/category-importance-dialog";
import { Button } from "@/components/ui/button";

export function CategoryImportancePrompt() {
  const openCategoryImportanceDialog = useOpenCategoryImportanceDialog();
  const missingImportanceCount = useUnclassifiedExpenseCount();

  if (missingImportanceCount <= IMPORTANCE_PROMPT_THRESHOLD) {
    return null;
  }

  return (
    <div className="flex @md:flex-row flex-col @md:items-center @md:justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 text-sm shadow-xs dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
      <div className="flex min-w-0 items-start gap-3">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-300" />
        <div className="min-w-0">
          <p className="font-medium">Set importance for {missingImportanceCount} transactions</p>
          <p className="text-blue-800/80 dark:text-blue-100/75">
            Classify categories to improve spending breakdowns and cash-flow charts.
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="@md:self-center border-blue-300 bg-white text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-100 dark:hover:bg-blue-900/50"
        onClick={openCategoryImportanceDialog}
      >
        <TagsIcon className="size-4" />
        Update importance
      </Button>
    </div>
  );
}
