import { getUserDbStub } from "@/lib/user-db-stub";
import { authMiddleware } from "../common/auth";
import { contractApi } from "../common/contract";

export const currencyRouter = {
  refresh: contractApi.currency.refresh.use(authMiddleware).handler(async ({ input, context }) => {
    const stub = await getUserDbStub(context.auth.userId);
    return stub.refreshCurrencyRates({ baseCurrency: input.baseCurrency });
  }),
};
