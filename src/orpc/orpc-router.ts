import { RPCHandler } from "@orpc/server/fetch";
import { RequestHeadersPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import { assistantRouter } from "./routers/assistant.router";
import { authRouter } from "./routers/auth.router";
import { currencyRouter } from "./routers/currency.router";
import { integrationsRouter } from "./routers/integrations.router";

export const orpcRouter = {
  auth: authRouter,
  currency: currencyRouter,
  integrations: integrationsRouter,
  assistant: assistantRouter,
};

export const orpcHandler = new RPCHandler(orpcRouter, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
});
