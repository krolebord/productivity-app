import type { ORPCContext } from "../orpc/common/os";
import { assistantDownloadHandler } from "./handlers/assistant.download";
import { googleCallbackHandler } from "./handlers/callback.google";
import { googleCalendarCallbackHandler } from "./handlers/callback.google-calendar";
import { mobileGoogleSignInHandler } from "./handlers/mobile.google";
import { MONOBANK_WEBHOOK_PREFIX, monobankWebhookHandler } from "./handlers/monobank.webhook";

export const apiHandler = createApiHandler({
  handlers: {
    "/assistant/download": assistantDownloadHandler,
    "/auth/callback/google": googleCallbackHandler,
    "/auth/callback/google-calendar": googleCalendarCallbackHandler,
    "/auth/mobile/google": mobileGoogleSignInHandler,
  },
  // Handlers matched by path prefix (for routes with dynamic path segments).
  prefixHandlers: [{ prefix: MONOBANK_WEBHOOK_PREFIX, handler: monobankWebhookHandler }],
  prefix: "/api",
});

export type ApiHandler = (ctx: {
  context: ORPCContext & { url: URL };
  request: Request;
}) => Promise<Response> | Response;

function createApiHandler({
  handlers,
  prefixHandlers = [],
  prefix,
}: {
  handlers: Record<string, ApiHandler>;
  prefixHandlers?: { prefix: string; handler: ApiHandler }[];
  prefix: string;
}) {
  const handlersMap = new Map<string, ApiHandler>(
    Object.entries(handlers).map(([path, handler]) => [prefix + path, handler]),
  );
  return async (request: Request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const handler = handlersMap.get(path) ?? prefixHandlers.find((entry) => path.startsWith(entry.prefix))?.handler;

    if (!handler) {
      return new Response("Not found", { status: 404 });
    }

    const reqHeaders = request.headers;
    const resHeaders = new Headers();
    const response = await handler({ context: { url, reqHeaders, resHeaders }, request });

    response.headers.forEach((value, key) => {
      resHeaders.set(key, value);
    });

    return new Response(response.body, { status: response.status, headers: resHeaders });
  };
}
