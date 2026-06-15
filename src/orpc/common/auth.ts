import {
  deleteCookie,
  getCookie,
  setCookie,
  sign,
  unsign,
} from "@orpc/server/helpers";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { type ORPCContext, osBase } from "./os";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

type SessionData = {
  sessionId: string;
};

export type AuthSession = {
  userId: string;
  sessionId: string;
  userName: string;
  userEmail: string;
  sessionExpiresAt: string;
};

export const authCookieSession = createCookieSession<SessionData>({
  name: "session",
  maxAge: SESSION_MAX_AGE_SECONDS,
});

async function checkAuthFromHeaders(
  headers: Headers | undefined,
): Promise<{ auth: AuthSession | null; shouldClearCookie: boolean }> {
  const session = await authCookieSession.getFromHeaders(headers);

  if (!session?.sessionId) {
    return { auth: null, shouldClearCookie: false };
  }

  const authSession = await db
    .selectFrom("session as s")
    .where("s.id", "=", session.sessionId)
    .innerJoin("user as u", "s.userId", "u.id")
    .select([
      "u.id as userId",
      "s.id as sessionId",
      "u.name as userName",
      "u.email as userEmail",
      "s.expiresAt as sessionExpiresAt",
    ])
    .executeTakeFirst();

  if (!authSession || new Date(authSession.sessionExpiresAt) < new Date()) {
    return { auth: null, shouldClearCookie: true };
  }

  return { auth: authSession, shouldClearCookie: false };
}

export async function getAuthFromHeaders(
  headers: Headers | undefined,
): Promise<AuthSession | null> {
  return (await checkAuthFromHeaders(headers)).auth;
}

export const authMiddleware = osBase.middleware(
  async ({ context, next, errors }) => {
    const { auth, shouldClearCookie } = await checkAuthFromHeaders(
      context.reqHeaders,
    );

    if (!auth) {
      if (shouldClearCookie) {
        await authCookieSession.clear(context);
      }
      throw errors.UNAUTHORIZED();
    }

    return next({
      context: {
        auth,
      },
    });
  },
);

export function createCookieSession<T>({
  name,
  maxAge,
}: {
  name: string;
  maxAge: number;
}) {
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
