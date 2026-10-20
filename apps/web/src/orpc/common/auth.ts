import { deleteCookie, getCookie, setCookie, sign, unsign } from "@orpc/server/helpers";
import { addSeconds } from "date-fns";
import { getContext } from "@/lib/context";
import type { UserRole } from "@/lib/db";
import { type ORPCContext, osBase } from "./os";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days
const SESSION_CACHE_TTL_SECONDS = 60 * 30;

type SessionData = {
  sessionId: string;
};

export type AuthSession = {
  userId: string;
  sessionId: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  sessionExpiresAt: string;
};

type StoredSession = Omit<AuthSession, "sessionId">;

export const authCookieSession = createCookieSession<SessionData>({
  name: "session",
  maxAge: SESSION_MAX_AGE_SECONDS,
});

export async function createSession(
  context: ORPCContext,
  user: { id: string; name: string; email: string; role: UserRole },
): Promise<void> {
  const sessionId = crypto.randomUUID();
  const expiresAt = addSeconds(new Date(), SESSION_MAX_AGE_SECONDS);
  const stored: StoredSession = {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userRole: user.role,
    sessionExpiresAt: expiresAt.toISOString(),
  };

  await getContext().SESSIONS.put(sessionId, JSON.stringify(stored), {
    expiration: Math.floor(expiresAt.getTime() / 1000),
  });
  await authCookieSession.set(context, { sessionId });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getContext().SESSIONS.delete(sessionId);
}

// A KV miss leaves the cookie alone: a just-written session may not be visible yet.
export async function getAuthFromHeaders(headers: Headers | undefined): Promise<AuthSession | null> {
  const session = await authCookieSession.getFromHeaders(headers);

  if (!session?.sessionId) {
    return null;
  }

  const stored = await getContext().SESSIONS.get<StoredSession>(session.sessionId, {
    type: "json",
    cacheTtl: SESSION_CACHE_TTL_SECONDS,
  });

  if (!stored || new Date(stored.sessionExpiresAt) < new Date()) {
    return null;
  }

  return { ...stored, sessionId: session.sessionId };
}

export const authMiddleware = osBase.middleware(async ({ context, next, errors }) => {
  const auth = await getAuthFromHeaders(context.reqHeaders);

  if (!auth) {
    throw errors.UNAUTHORIZED();
  }

  return next({
    context: {
      auth,
    },
  });
});

export function createCookieSession<T>({ name, maxAge }: { name: string; maxAge: number }) {
  const env = getContext();

  const getFromHeaders = async (headers: Headers | undefined) => {
    if (!headers) {
      return null;
    }
    const cookie = getCookie(headers, name);
    if (!cookie) {
      return null;
    }
    const payload = await unsign(cookie, env.AUTH_SECRET);
    if (!payload) {
      return null;
    }
    try {
      return JSON.parse(payload) as T;
    } catch {
      return null;
    }
  };

  const get = async (context: ORPCContext) => {
    return getFromHeaders(context.reqHeaders);
  };

  const set = async (context: ORPCContext, value: T) => {
    const headers = context.resHeaders;
    if (!headers) {
      return;
    }
    const payload = await sign(JSON.stringify(value), env.AUTH_SECRET);
    setCookie(headers, name, payload, {
      httpOnly: true,
      secure: (env.MODE as string) === "production",
      sameSite: "lax",
      maxAge,
    });
  };

  const clear = async (context: ORPCContext) => {
    const headers = context.resHeaders;
    if (!headers) {
      return;
    }
    deleteCookie(headers, name);
  };

  return { get, getFromHeaders, set, clear, name, maxAge };
}
