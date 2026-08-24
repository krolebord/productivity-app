import { z } from "zod";
import {
  ACCOUNT_BALANCE_RECONCILIATION_SQL,
  type AccountBalanceReconciliationRow,
} from "@/lib/account-balance-reconciliation";
import { defineJob } from "./jobs-base";

export const ACCOUNT_BALANCE_RECONCILIATION_DEDUPE_KEY = "account-balance-reconciliation";
export const ACCOUNT_BALANCE_RECONCILIATION_DELAY_MS = 1_000;
export const ACCOUNT_BALANCE_RECONCILIATION_MAX_DELAY_MS = 10_000;

/** Correct the synced balance cache after raw transaction mutations. */
export const reconcileAccountBalancesJob = defineJob({ type: "reconcile-account-balances" })
  .input(z.object({}))
  .handler(async ({ context }) => {
    const accounts = context.syncDb.execute<AccountBalanceReconciliationRow>({
      sql: ACCOUNT_BALANCE_RECONCILIATION_SQL,
      parameters: [],
    }).rows;

    for (const account of accounts) {
      if (Number(account.balance) === Number(account.nextBalance)) {
        continue;
      }

      context.syncDb.enqueueEvent(
        context.syncDb.createEvent({
          type: "item-updated",
          dataset: "_account",
          item_id: account.id,
          payload: { balance: Number(account.nextBalance) },
        }),
      );
    }
  });
