import "react-native-get-random-values";
import { safe } from "@orpc/client";
import type { SessionUser } from "@productivity/core/api/contract";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api } from "./api";
import { API_URL } from "./config";

/** Deep-link path the server's Google callback redirects to; see `+native-intent.tsx`. */
export const GOOGLE_AUTH_PATH = "oauth/google";

export function isGoogleAuthRedirect(url: string) {
  return /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/*oauth\/google(?:[?#]|$)/i.test(url);
}

export type GoogleSignInResult =
  | { type: "success"; token: string; user: SessionUser }
  | { type: "cancel" }
  | { type: "error"; message: string };

/**
 * Runs the server's Google OAuth flow in an auth browser session. The server answers with a
 * one-time code, redeemed together with a nonce that only this call knows.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const nonce = randomNonce();
  const redirectUri = Linking.createURL(GOOGLE_AUTH_PATH);
  const startUrl = `${API_URL}/api/auth/mobile/google?${new URLSearchParams({ redirect_uri: redirectUri, nonce })}`;

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
  } catch {
    return { type: "error", message: "Couldn't open Google sign-in." };
  }
  if (result.type !== "success") {
    return { type: "cancel" };
  }

  const { code, error } = Linking.parse(result.url).queryParams ?? {};
  if (typeof code !== "string") {
    return { type: "error", message: typeof error === "string" ? error : "Google sign-in failed. Try again." };
  }

  const exchange = await safe(api.auth.mobile.exchangeGoogleCode({ code, nonce }));
  if (exchange.error) {
    return { type: "error", message: "Couldn't finish signing in. Check your connection and try again." };
  }
  if (!exchange.data.success) {
    return { type: "error", message: exchange.data.error };
  }
  return { type: "success", token: exchange.data.token, user: exchange.data.user };
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
