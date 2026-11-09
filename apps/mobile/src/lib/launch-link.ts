/**
 * Whether the app was cold-started by a link that asked for Today explicitly (the Today widget).
 * Set by `+native-intent.tsx` before the first screen mounts; read by the tabs layout so the
 * "default home: Finances" preference doesn't send that launch to Finances.
 */
let launchedForToday = false;

export function markLaunchedForToday() {
  launchedForToday = true;
}

export function wasLaunchedForToday() {
  return launchedForToday;
}
