import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { DbToolsAccess } from "@sqlite-sync/ai";
import { createDbMcpInstructions, registerDbTools } from "@sqlite-sync/ai/mcp";
import { getMcpTokenAuth, type McpTokenAuth } from "@/lib/mcp-token";
import { getUserDbStub } from "@/lib/user-db-stub";

export const MCP_PATH = "/mcp";

const MCP_OVERVIEW = [
  "This server holds the signed-in user's personal productivity data: notes, tasks, habits, financial accounts, and transactions.",
  "Use it when the user asks about their own notes, plans, schedule, spending, or balances.",
].join("\n");
const MCP_WRITE_NOTE = "Writes sync to the user's devices immediately.";

function createMcpServer(auth: McpTokenAuth): McpServer {
  const mutations = auth.access === "read-write";
  const server = new McpServer(
    { name: "productivity-app", version: "0.1.0" },
    {
      instructions: createDbMcpInstructions({
        overview: mutations ? `${MCP_OVERVIEW}\n${MCP_WRITE_NOTE}` : MCP_OVERVIEW,
        mutations,
      }),
    },
  );

  registerDbTools(server, {
    mutations,
    access: async (): Promise<DbToolsAccess> => {
      const stub = await getUserDbStub(auth.userId);
      return {
        getSchemaDoc: () => stub.getSchemaDoc(),
        query: (input) => stub.query(input),
        ...(mutations ? { mutate: (input) => stub.mutate(input) } : {}),
      };
    },
  });

  return server;
}

export async function mcpHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const auth = await getMcpTokenAuth(request);
  if (!auth) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createMcpServer(auth).connect(transport);
  return transport.handleRequest(request);
}
