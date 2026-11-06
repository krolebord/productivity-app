// Dev-only render profiling for "this interaction feels slow" investigations.
//
// Wrap the subtrees you suspect in <Prof id="…">, call armProfiler() from the tap handler, and
// every commit within the next 1.5 s logs each wrapped subtree's render time to Metro:
//   [prof] today:completed update actual=61.4ms base=77.2ms commit@+153ms
// `actual` is this commit's render time (memoized children skipped), `base` what a full re-render
// would cost. Lines are buffered and printed after the window, so logging doesn't slow the commit
// being measured. Everything is a no-op outside __DEV__; remove the wrappers once done.
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

const WINDOW_MS = 1500;
const state = { armedAt: 0 };
const buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function record(line: string) {
  buffer.push(line);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    for (const entry of buffer.splice(0)) console.log(entry);
  }, WINDOW_MS + 100);
}

/** Call from a tap handler; commits within the next 1.5 s are logged. */
export function armProfiler() {
  if (__DEV__) state.armedAt = performance.now();
}

/** Logs a timestamp relative to the last armProfiler() call, e.g. from an effect. */
export function markSinceTap(label: string) {
  if (!__DEV__ || !state.armedAt) return;
  const sinceTap = performance.now() - state.armedAt;
  if (sinceTap > WINDOW_MS) return;
  record(`[mark] ${label}: +${sinceTap.toFixed(1)}ms`);
}

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, _startTime, commitTime) => {
  if (!state.armedAt) return;
  const sinceTap = commitTime - state.armedAt;
  if (sinceTap < 0 || sinceTap > WINDOW_MS) return;
  record(
    `[prof] ${id} ${phase} actual=${actualDuration.toFixed(1)}ms base=${baseDuration.toFixed(1)}ms commit@+${sinceTap.toFixed(0)}ms`,
  );
};

export function Prof({ id, children }: { id: string; children: ReactNode }) {
  if (!__DEV__) return children;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
