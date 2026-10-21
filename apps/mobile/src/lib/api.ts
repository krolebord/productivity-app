import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ApiClient } from "@productivity/core/api/contract";
import { API_URL } from "./config";

let sessionToken: string | null = null;

export function setApiSessionToken(token: string | null) {
  sessionToken = token;
}

export function getApiSessionToken() {
  return sessionToken;
}

const link = new RPCLink({
  url: `${API_URL}/rpc`,
  headers: (): Record<string, string> => (sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
});

export const api: ApiClient = createORPCClient(link);
