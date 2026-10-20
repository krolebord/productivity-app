import { numericToAlphaCurrency } from "@productivity/core/monobank/currency-codes";
import { getContext } from "@/lib/context";
import type { MonobankMetadataInput } from "@/user-db/jobs/monobank-metadata";
import type { MonobankClientInfo } from "./api";

export { getUserDbStub } from "@/lib/user-db-stub";

export function buildMonobankWebhookUrl(connectionId: string, webhookSecret: string): string {
  const env = getContext();
  return `${env.VITE_APP_URL}/api/monobank/webhook/${connectionId}/${webhookSecret}`;
}

export function mapClientAccountsToMetadata(info: MonobankClientInfo): NonNullable<MonobankMetadataInput["accounts"]> {
  return info.accounts.map((account) => {
    const currency = numericToAlphaCurrency(account.currencyCode) ?? "";
    const displayName = account.maskedPan[0] ?? account.type ?? account.id;
    return {
      providerAccountId: account.id,
      displayName,
      accountType: account.type,
      currency,
      maskedPan: JSON.stringify(account.maskedPan),
    };
  });
}
