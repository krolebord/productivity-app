import { IMPORTANCE_TIERS, type ImportanceTier } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export const IMPORTANCE_CONFIG: Record<ImportanceTier, { label: string; activeClass: string; badgeClass: string }> = {
  fixed: {
    label: "Fixed",
    activeClass: "bg-background text-red-600 shadow-sm dark:bg-input/50 dark:text-red-400",
    badgeClass: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  flexible: {
    label: "Flexible",
    activeClass: "bg-background text-yellow-600 shadow-sm dark:bg-input/50 dark:text-yellow-400",
    badgeClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  },
  optional: {
    label: "Optional",
    activeClass: "bg-background text-green-600 shadow-sm dark:bg-input/50 dark:text-green-400",
    badgeClass: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  investment: {
    label: "Invest",
    activeClass: "bg-background text-blue-600 shadow-sm dark:bg-input/50 dark:text-blue-400",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
};

export function getImportanceLabel(importance: ImportanceTier | null) {
  return importance ? IMPORTANCE_CONFIG[importance].label : "None";
}

export function ImportanceBadge({ importance, className }: { importance: ImportanceTier | null; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 font-medium text-xs",
        importance ? IMPORTANCE_CONFIG[importance].badgeClass : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {getImportanceLabel(importance)}
    </span>
  );
}

export function ImportanceSelector({
  value,
  onChange,
  className,
}: {
  value: ImportanceTier | null;
  onChange: (importance: ImportanceTier) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid h-10 grid-cols-4 gap-1 rounded-md border border-input bg-muted/50 p-1", className)}>
      {IMPORTANCE_TIERS.map((tier) => {
        const config = IMPORTANCE_CONFIG[tier];
        const isActive = value === tier;
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onChange(tier)}
            className={cn(
              "flex min-w-0 items-center justify-center rounded-sm px-1.5 font-medium text-sm transition-all",
              isActive ? config.activeClass : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
            )}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
