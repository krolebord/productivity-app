import { db } from "./db";

export type McpTokenAccess = "read" | "read-write";

export type McpTokenAuth = {
  tokenId: string;
  userId: string;
  access: McpTokenAccess;
};

const TOKEN_PREFIX = "pat_";
const LAST_USED_RESOLUTION_MS = 10 * 60 * 1000;

export function generateMcpToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return (
    TOKEN_PREFIX +
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  );
}

export async function hashMcpToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getMcpTokenAuth(request: Request): Promise<McpTokenAuth | null> {
  const header = request.headers.get("authorization");
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token?.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const row = await db
    .selectFrom("mcp_token")
    .select(["id", "userId", "access", "lastUsedAt"])
    .where("tokenHash", "=", await hashMcpToken(token))
    .executeTakeFirst();
  if (!row) {
    return null;
  }

  const now = Date.now();
  if (!row.lastUsedAt || now - Date.parse(row.lastUsedAt) > LAST_USED_RESOLUTION_MS) {
    await db
      .updateTable("mcp_token")
      .set({ lastUsedAt: new Date(now).toISOString() })
      .where("id", "=", row.id)
      .execute();
  }

  return { tokenId: row.id, userId: row.userId, access: row.access };
}
