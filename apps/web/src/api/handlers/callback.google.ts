import { env } from "cloudflare:workers";
import { z } from "zod";
import { createMobileOAuthCode, mobileRedirect } from "@/lib/mobile-oauth";
import { createSession } from "@/orpc/common/auth";
import { handleGoogleCallback } from "@/orpc/routers/auth.router";
import type { ApiHandler } from "../api-handler";

const schema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().nullable().optional(),
});

export const googleCallbackHandler: ApiHandler = async ({ request, context }) => {
  const searchParams = new URL(request.url).searchParams;
  const data = schema.parse({
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    error: searchParams.get("error"),
  });

  if (data.error || !data.code || !data.state) {
    return Response.redirect(`${env.VITE_APP_URL}/sign-in`, 302);
  }

  const result = await handleGoogleCallback(context, { code: data.code, state: data.state });

  if (result.mobile) {
    if (!result.success) {
      return mobileRedirect(result.mobile, { error: result.error });
    }
    const code = await createMobileOAuthCode(result.user.id, result.mobile.nonce);
    return mobileRedirect(result.mobile, { code });
  }

  if (!result.success) {
    return Response.redirect(`${env.VITE_APP_URL}/sign-in`, 302);
  }
  await createSession(context, result.user);
  return Response.redirect(`${env.VITE_APP_URL}/`, 302);
};
