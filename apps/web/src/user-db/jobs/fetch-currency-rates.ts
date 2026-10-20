import { APP_CURRENCIES, type AppCurrencyCode } from "@productivity/core/currency/currencies";
import type { UserSyncDbSchema } from "@productivity/core/user-db/migrations";
import type { ServerSyncDb } from "@sqlite-sync/cloudflare";
import { z } from "zod";
import { type BaseCurrencyCode, baseCurrencySchema, fetchCurrentRatesAgainstBase } from "@/lib/currency/current-rates";
import { defineJob } from "./jobs-base";

/** Fetch today's rates and upsert them into the synced DB (Durable Object only). */
export async function fetchAndPersistCurrencyRates(
  syncDb: ServerSyncDb<UserSyncDbSchema>,
  baseCurrency: BaseCurrencyCode,
): Promise<{ date: string; base: BaseCurrencyCode }> {
  const { base, rates } = await fetchCurrentRatesAgainstBase({
    base: baseCurrency,
  });

  const date = new Date().toISOString().slice(0, 10);
  const id = `${date}-${base}`;
  const rateValues = Object.fromEntries(
    APP_CURRENCIES.map((currency) => [currency, rates[currency] ?? (currency === base ? 1 : null)]),
  ) as Record<AppCurrencyCode, number | null>;

  syncDb.applySnapshot({
    dataset: "_currency_rate",
    id,
    patch: {
      date,
      baseCurrency: base,
      ...rateValues,
    },
  });

  return { date, base };
}

export const fetchCurrencyRatesJob = defineJob({ type: "fetch-currency-rates" })
  .input(z.object({ baseCurrency: baseCurrencySchema }))
  .handler(async ({ input, context }) => {
    await fetchAndPersistCurrencyRates(context.syncDb, input.baseCurrency);
  });
