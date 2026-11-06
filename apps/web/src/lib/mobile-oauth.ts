import { db } from "@/lib/db";

/**
 * Mobile Google sign-in runs the web OAuth flow in the system browser, then hands the app a
 * short-lived one-time code through its deep link. The code alone isn't enough: exchanging it also
 * needs the nonce the app generated, which never travels through the deep link, so another app
 * claiming the same URL scheme can't redeem an intercepted code.
 */
export type MobileOAuthRequest = { redirectUri: string; nonce: string };

const ALLOWED_SCHEMES = new Set(["productivity:", "productivity-dev:"]);
const NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const CODE_TTL_MS = 2 * 60 * 1000;
const TARGET_PREFIX = "google-mobile:";

export function parseMobileOAuthRequest(params: URLSearchParams): MobileOAuthRequest | null {
  const redirectUri = params.get("redirect_uri");
  const nonce = params.get("nonce");
  if (!redirectUri || !nonce || !NONCE_PATTERN.test(nonce)) {
    return null;
  }
  try {
    if (!ALLOWED_SCHEMES.has(new URL(redirectUri).protocol)) {
      return null;
    }
  } catch {
    return null;
  }
  return { redirectUri, nonce };
}

export function mobileRedirect(request: MobileOAuthRequest, params: Record<string, string>) {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

export async function createMobileOAuthCode(userId: string, nonce: string): Promise<string> {
  const code = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const now = new Date();

  // Codes the app never redeemed would otherwise pile up.
  await db
    .deleteFrom("verification")
    .where("target", "like", `${TARGET_PREFIX}%`)
    .where("expiresAt", "<", now.toISOString())
    .execute();

  await db
    .insertInto("verification")
    .values({
      target: TARGET_PREFIX + (await hashCode(code)),
      value: JSON.stringify({ userId, nonce }),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
    })
    .execute();

  return code;
}

/** Spends the code whether or not the nonce matches; returns the user id on success. */
export async function consumeMobileOAuthCode(input: { code: string; nonce: string }): Promise<string | null> {
  const row = await db
    .deleteFrom("verification")
    .where("target", "=", TARGET_PREFIX + (await hashCode(input.code)))
    .returning(["value", "expiresAt"])
    .executeTakeFirst();

  if (!row || new Date(row.expiresAt) < new Date()) {
    return null;
  }

  try {
    const stored = JSON.parse(row.value) as { userId: string; nonce: string };
    return stored.nonce === input.nonce ? stored.userId : null;
  } catch {
    return null;
  }
}

async function hashCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
