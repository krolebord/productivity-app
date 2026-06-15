import { routeAgentRequest } from "agents";
import { routePartykitRequest } from "partyserver";
import { apiHandler } from "./api/api-handler";
import { getUserIdFromRequest } from "./lib/auth-server";
import { orpcHandler } from "./orpc/orpc-router";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/rpc")) {
      const { matched, response } = await orpcHandler.handle(request, {
        prefix: "/rpc",
        context: {},
      });

      if (matched) {
        return response;
      }

      return new Response("Not found", { status: 404 });
    }

    if (url.pathname.startsWith("/api")) {
      return apiHandler(request);
    }

    if (url.pathname.startsWith("/agents")) {
      // Agent instances are named `user-${userId}:${conversationId}` — only the owning user may reach theirs.
      const guard = async (req: Request, lobby: { name: string }) => {
        const userId = await getUserIdFromRequest(req);
        if (!userId || !lobby.name.startsWith(`user-${userId}:`)) {
          return new Response("Unauthorized", { status: 401 });
        }
      };

      const agentResponse = await routeAgentRequest(request, env, {
        locationHint: "weur",
        onBeforeConnect: (req, lobby) => guard(req, lobby),
        onBeforeRequest: (req, lobby) => guard(req, lobby),
      });
      if (agentResponse) {
        return agentResponse;
      }

      return new Response("Not found", { status: 404 });
    }

    const partykitRequest = await routePartykitRequest(request, env, {
      prefix: "user-db",
      locationHint: "weur",
      onBeforeConnect: async (req, lobby) => {
        const userId = await getUserIdFromRequest(req);
        if (!userId || lobby.name !== `user-${userId}`) {
          return new Response("Unauthorized", { status: 401 });
        }
      },
    });
    if (partykitRequest) {
      return partykitRequest;
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export { AssistantAgent } from "./agent/assistant-agent";
export { UserDbServer } from "./user-db/user-db-server";
