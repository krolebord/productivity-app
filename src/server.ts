import { routePartykitRequest } from "partyserver";
import { apiHandler } from "./api/api-handler";
import { getUserIdFromRequest } from "./lib/auth-server";
import { renewDueMonobankWebhooks } from "./lib/monobank/webhook-renewal";
import { orpcHandler } from "./orpc/orpc-router";

export default {
  async scheduled(controller) {
    const result = await renewDueMonobankWebhooks(controller.scheduledTime);
    if (result.checked > 0) {
      console.log("[monobank-webhook-renewal]", result);
    }
  },

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

export { CodemodeRuntime } from "@cloudflare/codemode";
export { AssistantAgent } from "./agent/assistant-agent";
export { UserDbServer } from "./user-db/user-db-server";
