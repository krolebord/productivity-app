import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useDb, useDbState } from "@/user-db/user-db";

const SHOW_DELAY_MS = 1000;

export function OfflineBanner() {
  const { state } = useDb();
  const { remoteState } = useDbState();
  const [visible, setVisible] = useState(false);

  const showTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The delay starts at the first "offline" and only "online" cancels it, so a slow initial
  // connect stays quiet while quick reconnect attempts can't keep resetting it.
  useEffect(() => {
    if (remoteState === "online") {
      clearTimeout(showTimeout.current);
      showTimeout.current = undefined;
      setVisible(false);
    } else if (remoteState === "offline" && !showTimeout.current) {
      showTimeout.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    }
  }, [remoteState]);

  useEffect(() => () => clearTimeout(showTimeout.current), []);

  if (!visible) return null;

  const reconnecting = remoteState === "pending";

  return (
    <div role="status" className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-4">
      <button
        type="button"
        aria-busy={reconnecting}
        title="Reconnect"
        onClick={() => {
          if (!reconnecting) state.goOnline();
        }}
        className="fade-in slide-in-from-top-2 pointer-events-auto flex min-w-0 animate-in items-center gap-2 rounded-full border border-rose-500/30 bg-rose-50 py-1.5 pr-3 pl-3.5 text-rose-700 text-sm shadow-md transition-colors hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900"
      >
        <WifiOff className="size-4 shrink-0" />
        <span className="min-w-0 truncate">
          You're offline
          <span className="hidden sm:inline">. Changes are saved on this device and will sync later.</span>
        </span>
        <RefreshCw className={cn("size-3.5 shrink-0 opacity-80", reconnecting && "animate-spin")} />
      </button>
    </div>
  );
}
