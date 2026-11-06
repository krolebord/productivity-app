import { env } from "cloudflare:workers";
import { parseMobileOAuthRequest } from "@/lib/mobile-oauth";
import { initiateMobileGoogleSignIn } from "@/orpc/routers/auth.router";
import type { ApiHandler } from "../api-handler";

/**
 * Opened by the mobile app in an auth browser session: stores the OAuth state cookie, then sends
 * the browser to Google. The callback redirects back into the app with a one-time code.
 */
export const mobileGoogleSignInHandler: ApiHandler = async ({ request, context }) => {
  const url = new URL(request.url);

  // The state cookie must live on the origin Google redirects back to, which may not be the
  // one the app reached (e.g. a dev server behind a proxy).
  const appOrigin = new URL(env.VITE_APP_URL).origin;
  if (url.origin !== appOrigin) {
    return Response.redirect(`${appOrigin}${url.pathname}${url.search}`, 302);
  }

  const mobile = parseMobileOAuthRequest(url.searchParams);
  if (!mobile) {
    return new Response("Invalid sign-in request", { status: 400 });
  }

  const authorizationUrl = await initiateMobileGoogleSignIn(context, mobile);
  return Response.redirect(authorizationUrl.toString(), 302);
};
