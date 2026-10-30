import { db } from "@/lib/db";
import { generateMcpToken, hashMcpToken } from "@/lib/mcp-token";
import { authMiddleware } from "../common/auth";
import { contractApi } from "../common/contract";

const api = contractApi.mcp;

const listTokens = api.listTokens.use(authMiddleware).handler(async ({ context }) => {
  return db
    .selectFrom("mcp_token")
    .select(["id", "name", "access", "createdAt", "lastUsedAt"])
    .where("userId", "=", context.auth.userId)
    .orderBy("createdAt", "desc")
    .execute();
});

const createToken = api.createToken.use(authMiddleware).handler(async ({ input, context }) => {
  const token = generateMcpToken();
  const id = crypto.randomUUID();
  await db
    .insertInto("mcp_token")
    .values({
      id,
      userId: context.auth.userId,
      name: input.name,
      tokenHash: await hashMcpToken(token),
      access: input.access,
      createdAt: new Date().toISOString(),
    })
    .execute();
  return { id, token };
});

const revokeToken = api.revokeToken.use(authMiddleware).handler(async ({ input, context }) => {
  await db.deleteFrom("mcp_token").where("id", "=", input.id).where("userId", "=", context.auth.userId).execute();
  return { success: true as const };
});

export const mcpRouter = {
  listTokens,
  createToken,
  revokeToken,
};
