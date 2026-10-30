import { z } from "zod";
import type { TransactionRow } from "../transactions";

// Shared spec used by the agent's `renderTransactions` tool (server-side
// validation) and the <TransactionsCard /> renderer (client-side rendering).
// Keep this file dependency-light (zod only) so it bundles cleanly on the client.

const RefItem = z.object({
  kind: z.literal("ref"),
  id: z
    .string()
    .min(1)
    .describe("Id of an existing transaction_entry row. The client resolves it from the synced database."),
});

const InlineItem = z.object({
  kind: z.literal("inline"),
  type: z
    .enum(["expense", "income", "transfer", "adjustment"])
    .describe("Transaction type; sets the icon and colour and, for the amount, the sign."),
  title: z.string().min(1).describe("Short label for the transaction."),
  amount: z.number().positive().describe("Amount magnitude (always positive). The sign shown is derived from `type`."),
  currency: z.string().min(1).describe("ISO 4217 currency code of the amount, e.g. USD."),
  category: z.string().optional().describe("Optional category label (expenses/income)."),
  importance: z
    .enum(["fixed", "flexible", "optional", "investment"])
    .optional()
    .describe("Optional importance tier; expenses only."),
  effectiveAt: z
    .number()
    .optional()
    .describe("When it happened, as a Unix epoch in milliseconds. Defaults to now when omitted."),
  accountLabel: z
    .string()
    .optional()
    .describe("Optional plain-text account name. Inline items are not backed by a real account."),
  notes: z.string().optional().describe("Optional free-text note."),
});

const TransactionItem = z.discriminatedUnion("kind", [RefItem, InlineItem]);

export const TransactionsSpecSchema = z.object({
  title: z.string().optional().describe("Optional heading shown above the list."),
  description: z.string().optional().describe("Optional one-line caption under the title."),
  items: z
    .array(TransactionItem)
    .min(1)
    .max(50)
    .describe(
      "Transactions to render, in order. Prefer `ref` items for real rows; use `inline` only for transactions that do not exist in the database.",
    ),
});

export type TransactionsSpec = z.infer<typeof TransactionsSpecSchema>;
export type TransactionRefItem = z.infer<typeof RefItem>;
export type TransactionInlineItem = z.infer<typeof InlineItem>;

/**
 * Shapes an inline item into a transaction record so the real row component can render it.
 * The sign follows the type, as stored (negative for expenses and transfer sources).
 */
export function inlineTransactionRecord(item: TransactionInlineItem, now: number): TransactionRow {
  const magnitude = Math.abs(item.amount);
  const amount = item.type === "income" ? magnitude : item.type === "adjustment" ? item.amount : -magnitude;
  return {
    id: "",
    type: item.type,
    accountId: "",
    accountCurrency: item.currency,
    amount,
    counterpartyAccountId: "",
    counterpartyCurrency: "",
    counterpartyAmount: null,
    title: item.title,
    category: item.category ?? "",
    importance: item.importance ?? null,
    notes: item.notes ?? "",
    effectiveAt: item.effectiveAt ?? now,
    providerType: null,
    providerId: null,
    createdAt: now,
    updatedAt: now,
    tombstone: false,
  };
}
