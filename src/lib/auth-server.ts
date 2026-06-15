import { getAuthFromHeaders } from "@/orpc/common/auth";

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const auth = await getAuthFromHeaders(request.headers);
  return auth?.userId ?? null;
}
