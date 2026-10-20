import { useDb, useDbState } from "@productivity/core/user-db/db-context";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 1000;
const BACK_ONLINE_MS = 1000;

type Phase = "hidden" | "offline" | "back-online" | "leaving";

export function OfflineBanner() {
  const { state } = useDb();
  const { remoteState } = useDbState();
  const [phase, setPhase] = useState<Phase>("hidden");

  const online = remoteState === "online";

  // Keyed on a boolean, so flips between "connecting" and "offline" during retries don't restart the delay.
  useEffect(() => {
    if (online) {
      setPhase((current) => (current === "offline" ? "back-online" : current));
      return;
    }
    setPhase((current) => (current === "back-online" || current === "leaving" ? "offline" : current));
    const timeout = setTimeout(() => setPhase("offline"), SHOW_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [online]);

  useEffect(() => {
    if (phase !== "back-online") return;
    const timeout = setTimeout(() => setPhase("leaving"), BACK_ONLINE_MS);
    return () => clearTimeout(timeout);
  }, [phase]);

  if (phase === "hidden") return null;

  const offline = phase === "offline";
  const reconnecting = offline && remoteState === "connecting";

  return (
    <div role="status" className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-4">
      <button
        type="button"
        disabled={!offline}
        aria-busy={reconnecting}
        title={offline ? "Reconnect" : undefined}
        onClick={() => state.goOnline()}
        onAnimationEnd={(event) => {
          if (phase === "leaving" && event.target === event.currentTarget) setPhase("hidden");
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
