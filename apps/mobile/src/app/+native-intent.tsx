import { generateId } from "@sqlite-sync/core";
import { isGoogleAuthRedirect } from "../lib/google-sign-in";
import { markLaunchedForToday } from "../lib/launch-link";

/**
 * Rewrites incoming deep links before the router sees them.
 *
 * - The Google sign-in redirect is consumed by `openAuthSessionAsync`; on Android it also arrives
 *   as a regular deep link, which the router would otherwise open as an unmatched route.
 * - Widget links (core's WIDGET_PATHS) that aren't routes: a widget's links are fixed when it's
 *   drawn, so it can't mint an id per tap; `note/new` and `task/new` become a fresh draft here.
 *   `today` is the Today tab, asked for explicitly (see `wasLaunchedForToday`).
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (isGoogleAuthRedirect(path)) return null;
    const route = new URL(path, "app://local").pathname.replace(/^\/+|\/+$/g, "");
    if (route === "today") {
      if (initial) markLaunchedForToday();
      return "/";
    }
    if (route === "note/new") return `/note/${generateId()}?draft=1`;
    if (route === "task/new") return `/task/${generateId()}?draft=1`;
    return path;
  } catch {
    return path;
  }
}
