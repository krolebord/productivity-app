import { isGoogleAuthRedirect } from "../lib/google-sign-in";

/**
 * The Google sign-in redirect is consumed by `openAuthSessionAsync`; on Android it also arrives
 * as a regular deep link, which the router would otherwise open as an unmatched route.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return isGoogleAuthRedirect(path) ? null : path;
  } catch {
    return path;
  }
}
