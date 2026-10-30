import { safe } from "@orpc/client";
import { refreshAccountBalances } from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useCallback, useState } from "react";
import { api } from "./api";

export type RefreshStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

const IDLE: RefreshStatus = { state: "idle" };

function failure(summary: string, error: unknown): RefreshStatus {
  const detail = error instanceof Error && error.message ? error.message.replace(/\.?$/, ".") : "Try again.";
  return { state: "error", message: `${summary} ${detail}` };
}

/**
 * Asks the user's Durable Object to fetch and store today's rates, as the web's "Refresh rates".
 * The DO is the sole writer; the new row arrives through sync.
 */
export function useRefreshRates() {
  const [status, setStatus] = useState<RefreshStatus>(IDLE);

  const refresh = useCallback(async () => {
    setStatus({ state: "pending" });
    const { error, data } = await safe(api.currency.refresh({ baseCurrency: "USD" }));
    setStatus(
      error
        ? failure("Couldn't refresh rates.", error)
        : { state: "success", message: `Stored rates for ${data.date}.` },
    );
  }, []);

  return { status, refresh, reset: useCallback(() => setStatus(IDLE), []) };
}

/**
 * Recomputes every account balance from its transactions, as the web's "Refresh balances". Runs
 * locally like any other edit, so it works offline and syncs afterwards.
 */
export function useRefreshBalances() {
  const db = useDb();
  const [status, setStatus] = useState<RefreshStatus>(IDLE);

  const refresh = useCallback(() => {
    try {
      const { accountCount, changedCount } = refreshAccountBalances(db.db);
      const accounts = `${accountCount} account${accountCount === 1 ? "" : "s"}`;
      setStatus({
        state: "success",
        message:
          changedCount === 0
            ? `Checked ${accounts}. All balances were already correct.`
            : `Checked ${accounts}. Updated ${changedCount} balance${changedCount === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus(failure("Couldn't refresh balances.", error));
    }
  }, [db]);

  return { status, refresh, reset: useCallback(() => setStatus(IDLE), []) };
}
