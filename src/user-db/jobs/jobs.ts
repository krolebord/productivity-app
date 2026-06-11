import { cleanupConversationAgentJob } from "./cleanup-conversation-agent";
import { fetchCurrencyRatesJob } from "./fetch-currency-rates";

export const jobs = [cleanupConversationAgentJob, fetchCurrencyRatesJob] as const;
