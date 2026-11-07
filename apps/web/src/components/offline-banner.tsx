import { useConnectionBanner } from "@productivity/core/user-db/use-connection-banner";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { phase, offline, reconnecting, reconnect, onLeft } = useConnectionBanner();

  if (phase === "hidden") return null;

  return (
    <div role="status" className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-4">
      <button
        type="button"
        disabled={!offline}
        aria-busy={reconnecting}
        title={offline ? "Reconnect" : undefined}
        onClick={reconnect}
        onAnimationEnd={(event) => {
          if (phase === "leaving" && event.target === event.currentTarget) onLeft();
        }}
        className={cn(
          "pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border py-1.5 pr-3 pl-3.5 text-sm shadow-md",
          phase === "leaving"
            ? "slide-out-to-top-2 fade-out animate-out fill-mode-forwards duration-300"
            : "fade-in slide-in-from-top-2 animate-in",
          offline
            ? "border-rose-500/30 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900"
            : "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        )}
      >
        {offline ? (
          <>
            <WifiOff className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              You're offline
              <span className="hidden sm:inline">. Changes are saved on this device and will sync later.</span>
            </span>
            <RefreshCw className={cn("size-3.5 shrink-0 opacity-80", reconnecting && "animate-spin")} />
          </>
        ) : (
          <>
            <Wifi className="size-4 shrink-0" />
            <span>Back online</span>
          </>
        )}
      </button>
    </div>
  );
}
