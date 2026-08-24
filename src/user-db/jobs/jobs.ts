import { calendarCleanupJob } from "./calendar-cleanup";
import { calendarMetadataJob } from "./calendar-metadata";
import { calendarSyncJob } from "./calendar-sync";
import { cleanupConversationAgentJob } from "./cleanup-conversation-agent";
import { fetchCurrencyRatesJob } from "./fetch-currency-rates";
import { monobankImportJob } from "./monobank-import";
import { monobankMetadataJob } from "./monobank-metadata";
import { reconcileAccountBalancesJob } from "./reconcile-account-balances";

export const jobs = [
  cleanupConversationAgentJob,
  fetchCurrencyRatesJob,
  monobankMetadataJob,
  monobankImportJob,
  reconcileAccountBalancesJob,
  calendarMetadataJob,
  calendarSyncJob,
  calendarCleanupJob,
] as const;
