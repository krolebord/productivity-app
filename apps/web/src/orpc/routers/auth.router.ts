import * as arctic from "arctic";
import * as z from "zod";
import { isAssistantAllowed } from "@/lib/assistant-access";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { consumeSignInCode, sendSignInCode } from "@/lib/sign-in-code";
import {
  authCookieSession,
  authMiddleware,
  createCookieSession,
  createSession,
  createSessionToken,
  deleteSession,
} from "../common/auth";
import { contractApi } from "../common/contract";
import type { ORPCContext } from "../common/os";
import { procedure, protectedProcedure } from "../common/procedure";

type OAuthSessionData = {
  state: string;
  codeVerifier: string;
};

const oauthCookieSession = createCookieSession<OAuthSessionData>({
  name: "oauth",
  maxAge: 60 * 10, // 10 minutes for OAuth flow
});

function getGoogleProvider() {
  const context = getContext();
  return new arctic.Google(
    context.GOOGLE_CLIENT_ID,
    context.GOOGLE_CLIENT_SECRET,
    `${context.VITE_APP_URL}/api/auth/callback/google`,
  );
}

export const signUpWithMagicLink = procedure
  .input(
    z.object({
      email: z.email(),
    }),
  )
  .handler(async ({ input }) => {
    await sendSignInCode(input.email);
    return { success: true };
  });

export const verifyMagicLink = procedure
  .input(
    z.object({
      email: z.email(),
      code: z.string().length(6),
    }),
  )
  .handler(async ({ input, context }) => {
    const result = await consumeSignInCode(input.email, input.code);
    if (!result.success) {
      return result;
    }

    const user = await findOrCreateUser({ email: input.email });
    await createSession(context, user);

    return { success: true as const, userId: user.id };
  });

export const getAuth = protectedProcedure.handler(async ({ context }) => {
  return {
    ...context.auth,
    assistantEnabled: isAssistantAllowed(context.auth.userEmail),
  };
});

export const signOut = protectedProcedure.handler(async ({ context }) => {
  await deleteSession(context.auth.sessionId);
  await authCookieSession.clear(context);
  return { success: true };
});

export const initiateGoogleSignIn = procedure.handler(async ({ context }) => {
  const google = getGoogleProvider();
  const state = arctic.generateState();
  const codeVerifier = arctic.generateCodeVerifier();

  const scopes = ["openid", "profile", "email"];
  const url = google.createAuthorizationURL(state, codeVerifier, scopes);

  await oauthCookieSession.set(context, { state, codeVerifier });

  return { url: url.toString() };
});

const findOrCreateUser = async (data: { email: string; name?: string }) => {
  const now = new Date().toISOString();
  let user = await db.selectFrom("user").where("email", "=", data.email).selectAll().executeTakeFirst();

  if (!user) {
    const userId = crypto.randomUUID();
    await db
      .insertInto("user")
      .values({
        id: userId,
        name: data.name || data.email.split("@")[0],
        email: data.email,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    user = await db.selectFrom("user").where("id", "=", userId).selectAll().executeTakeFirstOrThrow();
  }

  return user;
};

export const handleGoogleCallback = async (context: ORPCContext, data: { code: string; state: string }) => {
  const oauthData = await oauthCookieSession.get(context);

  if (!oauthData?.state || oauthData?.state !== data.state) {
    await oauthCookieSession.clear(context);
    return { success: false, error: "Invalid OAuth state" };
  }

  const codeVerifier = oauthData?.codeVerifier;
  if (!codeVerifier) {
    await oauthCookieSession.clear(context);
    return { success: false, error: "Missing code verifier" };
  }

  await oauthCookieSession.clear(context);

  const google = getGoogleProvider();

  let tokens: arctic.OAuth2Tokens;
  try {
    tokens = await google.validateAuthorizationCode(data.code, codeVerifier);
  } catch (e) {
    if (e instanceof arctic.OAuth2RequestError) {
      return { success: false, error: "Invalid authorization code" };
    }
    return { success: false, error: "Failed to validate authorization code" };
  }

  const idToken = tokens.idToken();
  if (!idToken) {
    return { success: false, error: "No ID token received" };
  }

  const claims = arctic.decodeIdToken(idToken) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!claims.email) {
    return { success: false, error: "No email in ID token" };
  }

  const user = await findOrCreateUser({ email: claims.email, name: claims.name });
  await createSession(context, user);

  return { success: true, userId: user.id };
};

const mobileAuth = contractApi.auth.mobile;

function toMobileSessionUser(user: { userId: string; userName: string; userEmail: string }) {
  return { ...user, assistantEnabled: isAssistantAllowed(user.userEmail) };
}

const mobileAuthRouter = {
  requestCode: mobileAuth.requestCode.handler(async ({ input }) => {
    await sendSignInCode(input.email);
    return { success: true as const };
  }),
  verifyCode: mobileAuth.verifyCode.handler(async ({ input }) => {
    const result = await consumeSignInCode(input.email, input.code);
    if (!result.success) {
      return result;
    }

    const user = await findOrCreateUser({ email: input.email });
    const token = await createSessionToken(user);
    return {
      success: true as const,
      token,
      user: toMobileSessionUser({ userId: user.id, userName: user.name, userEmail: user.email }),
    };
  }),
  getSession: mobileAuth.getSession.use(authMiddleware).handler(async ({ context }) => {
    const { userId, userName, userEmail } = context.auth;
    return toMobileSessionUser({ userId, userName, userEmail });
  }),
  signOut: mobileAuth.signOut.use(authMiddleware).handler(async ({ context }) => {
    await deleteSession(context.auth.sessionId);
    return { success: true as const };
  }),
};

export const authRouter = {
  signUpWithMagicLink,
  verifyMagicLink,
  getAuth,
  signOut,
  initiateGoogleSignIn,
  mobile: mobileAuthRouter,
};
