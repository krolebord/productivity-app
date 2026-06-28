import { CalendarRangeIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type DashboardRangeMode, resolveDashboardRange, useDashboardRangeStore } from "@/lib/dashboard-range-store";
import { cn } from "@/lib/utils";

const MODE_TABS: { id: DashboardRangeMode; label: string }[] = [
  { id: "days", label: "Last N days" },
  { id: "cycle", label: "Billing cycle" },
];

export function DashboardRangeSelect({ className }: { className?: string }) {
  const mode = useDashboardRangeStore((s) => s.mode);
  const days = useDashboardRangeStore((s) => s.days);
  const cycleDay = useDashboardRangeStore((s) => s.cycleDay);
  const setMode = useDashboardRangeStore((s) => s.setMode);
  const setDays = useDashboardRangeStore((s) => s.setDays);
  const setCycleDay = useDashboardRangeStore((s) => s.setCycleDay);

  const { label } = resolveDashboardRange({ mode, days, cycleDay }, new Date());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-between gap-2 font-normal", className)}>
          <span className="flex items-center gap-1.5">
            <CalendarRangeIcon className="size-4" />
            {label}
          </span>
          <ChevronsUpDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="inline-flex w-full rounded-md border bg-muted/50 p-0.5">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={cn(
                "flex-1 rounded px-2 py-1 font-medium text-xs transition-colors",
                mode === tab.id
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "days" ? (
          <div className="space-y-1.5">
            <Label htmlFor="range-days" className="text-xs">
              Number of days
            </Label>
            <Input
              id="range-days"
              type="number"
              min={1}
              max={31}
              value={days}
              onChange={(e) => setDays(e.target.valueAsNumber)}
            />
            <p className="text-muted-foreground text-xs">Trailing window ending today (1–31).</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="range-cycle" className="text-xs">
              Cycle starts on day
            </Label>
            <Input
              id="range-cycle"
              type="number"
              min={1}
              max={31}
              value={cycleDay}
              onChange={(e) => setCycleDay(e.target.valueAsNumber)}
            />
            <p className="text-muted-foreground text-xs">
              From the most recent {ordinalLabel(cycleDay)} through today.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ordinalLabel(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}
