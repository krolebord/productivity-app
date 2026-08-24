import { z } from "zod";
import { baseCurrencySchema } from "@/lib/currency/current-rates";
import { getUserDbStub } from "@/lib/user-db-stub";
import { protectedProcedure } from "../common/procedure";

export const currencyRouter = {
  refresh: protectedProcedure
    .input(
      z.object({
        baseCurrency: baseCurrencySchema.default("USD"),
      }),
    )
    .handler(async ({ input, context }) => {
      const stub = await getUserDbStub(context.auth.userId);
      return stub.refreshCurrencyRates({ baseCurrency: input.baseCurrency });
    }),
};
