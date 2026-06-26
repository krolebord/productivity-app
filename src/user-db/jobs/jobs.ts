import { cleanupConversationAgentJob } from "./cleanup-conversation-agent";
import { fetchCurrencyRatesJob } from "./fetch-currency-rates";
import { monobankImportJob } from "./monobank-import";
import { monobankMetadataJob } from "./monobank-metadata";

export const jobs = [
  cleanupConversationAgentJob,
  fetchCurrencyRatesJob,
  monobankMetadataJob,
  monobankImportJob,
] as const;
