import { type AuthSession, getAuthFromHeaders } from "@/orpc/common/auth";

export async function getAuthFromRequest(request: Request): Promise<AuthSession | null> {
  return getAuthFromHeaders(request.headers);
}

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const auth = await getAuthFromHeaders(request.headers);
  return auth?.userId ?? null;
}
