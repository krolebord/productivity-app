import type { ORPCOutputs } from "@/orpc/orpc-client";

type CachedAuth = ORPCOutputs["auth"]["getAuth"];

// Last-known auth, used to boot the app when getAuth can't reach the server
// (offline / server down). Only an explicit UNAUTHORIZED clears it — the data
// itself already lives on-device, so trusting a stale session adds no exposure.
const STORAGE_KEY = "productivity-auth-cache";

export function readCachedAuth(): CachedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CachedAuth) : null;
  } catch {
    return null;
  }
}

export function writeCachedAuth(auth: CachedAuth): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // Quota/private-mode failures just mean no offline boot fallback.
  }
}

export function clearCachedAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
