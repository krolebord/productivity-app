import { z } from "zod";
import { baseCurrencySchema, fetchCurrentRatesAgainstBase } from "@/lib/currency/current-rates";
import { protectedProcedure } from "../common/procedure";

export const currencyRouter = {
  refresh: protectedProcedure
    .input(
      z.object({
        baseCurrency: baseCurrencySchema.default("USD"),
      }),
    )
    .handler(async ({ input }) => {
      const { base, rates } = await fetchCurrentRatesAgainstBase({
        base: input.baseCurrency,
      });

      return {
        date: new Date().toISOString().slice(0, 10),
        base,
        rates,
      };
    }),
};
