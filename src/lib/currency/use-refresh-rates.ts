import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { APP_CURRENCIES, type AppCurrencyCode } from "@/lib/currency/currencies";
import { orpc } from "@/orpc/orpc-client";
import { useDb } from "@/user-db/user-db";

type RefreshRatesResult = {
  date: string;
  base: string;
  rates: Partial<Record<AppCurrencyCode, number>>;
};

function persistCurrencyRates(db: ReturnType<typeof useDb>["db"], data: RefreshRatesResult) {
  const id = `${data.date}-${data.base}`;
  const rateValues = Object.fromEntries(
    APP_CURRENCIES.map((currency) => [currency, data.rates[currency] ?? (currency === data.base ? 1 : null)]),
  ) as Record<AppCurrencyCode, number | null>;

  db.executeTransaction((trx) => {
    const [existing] = trx.executeKysely((q) => q.selectFrom("currency_rate").select("id").where("id", "=", id)).rows;

    if (existing) {
      trx.executeKysely((q) =>
        q
          .updateTable("currency_rate")
          .set({
            date: data.date,
            baseCurrency: data.base,
            ...rateValues,
          })
          .where("id", "=", id),
      );
      return;
    }

    trx.executeKysely((q) =>
      q.insertInto("currency_rate").values({
        id,
        date: data.date,
        baseCurrency: data.base,
        tombstone: false,
        ...rateValues,
      }),
    );
  });
}

/**
 * Fetches today's rates and stores them in the synced db. Lives here rather than
 * on the rates page because the finances header offers it from every tab.
 */
export function useRefreshRates() {
  const db = useDb();

  const mutation = useMutation(
    orpc.currency.refresh.mutationOptions({
      onSuccess: (data) => {
        persistCurrencyRates(db.db, data);
        toast.success("Currency rates refreshed.", {
          description: `Stored rates for ${data.date}.`,
        });
      },
      onError: (error) => {
        toast.error("Could not refresh currency rates.", {
          description: error instanceof Error ? error.message : "Unknown error.",
        });
      },
    }),
  );

  return {
    refreshRates: () => mutation.mutate({ baseCurrency: "USD" }),
    isRefreshing: mutation.isPending,
  };
}
