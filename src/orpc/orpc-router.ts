import { RPCHandler } from "@orpc/server/fetch";
import { RequestHeadersPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import { authRouter } from "./routers/auth.router";
import { currencyRouter } from "./routers/currency.router";

export const orpcRouter = {
  auth: authRouter,
  currency: currencyRouter,
};

export const orpcHandler = new RPCHandler(orpcRouter, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
});
