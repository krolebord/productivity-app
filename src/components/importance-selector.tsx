import { IMPORTANCE_STYLE } from "@/lib/finance-ui";
import { IMPORTANCE_TIERS, type ImportanceTier } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export function getImportanceLabel(importance: ImportanceTier | null) {
  return importance ? IMPORTANCE_STYLE[importance].label : "None";
}

export function ImportanceBadge({ importance, className }: { importance: ImportanceTier | null; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 font-medium text-xs",
        importance ? IMPORTANCE_STYLE[importance].tintedBadge : "bg-muted text-muted-foreground",
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
        const style = IMPORTANCE_STYLE[tier];
        const isActive = value === tier;

        return (
          <button
            key={tier}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(tier)}
            className={cn(
              "flex min-w-0 items-center justify-center rounded-sm px-1.5 font-medium text-sm transition-all",
              isActive ? style.activeClass : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
            )}
          >
            {style.label}
          </button>
        );
      })}
    </div>
  );
}
