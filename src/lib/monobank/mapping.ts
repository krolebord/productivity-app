import type { MonobankStatementItem } from "./types";

/**
 * The signed, app-shaped fields derived from a Monobank statement item.
 *
 * This intentionally mirrors the sign conventions in `src/lib/transactions.ts`
 * (`materializeTransaction`): expenses are stored as a negative `amount`, income as positive.
 * Monobank already reports `statementItem.amount` signed the same way (negative for outgoing,
 * positive for incoming) in minor units, so converting to major units preserves the sign.
 */
export type MappedMonobankTransaction = {
  type: "expense" | "income";
  /** Signed amount in major units (negative = expense, positive = income). */
  amount: number;
  /** Epoch milliseconds the transaction happened. */
  effectiveAt: number;
  title: string;
  notes: string;
};

/**
 * Map a Monobank statement item to the app transaction fields, or `null` when the event should
 * be skipped purely on its own shape (held authorization or zero amount). Linking/currency/dedupe
 * rules are enforced separately by the import job.
 */
export function mapStatementItemToTransaction(item: MonobankStatementItem): MappedMonobankTransaction | null {
  if (item.hold === true) {
    return null;
  }

  if (item.amount === 0) {
    return null;
  }

  const amount = item.amount / 100;

  return {
    type: amount < 0 ? "expense" : "income",
    amount,
    effectiveAt: item.time * 1000,
    title: item.description ?? "",
    notes: formatMonobankNotes(item),
  };
}

/**
 * Build the transaction notes from extra Monobank provider details. The statement `description`
 * is used as the transaction title, so it is deliberately not duplicated here. `Original MCC` is
 * included only when present and different from `mcc`.
 */
export function formatMonobankNotes(item: {
  comment?: string;
  receiptId?: string;
  mcc?: number;
  originalMcc?: number;
}): string {
  const lines: string[] = [];

  const comment = item.comment?.trim();
  if (comment) {
    lines.push(`Comment: ${comment}`);
  }

  if (item.receiptId) {
    lines.push(`Receipt: ${item.receiptId}`);
  }

  if (item.mcc !== undefined) {
    lines.push(`MCC: ${item.mcc}`);
  }

  if (item.originalMcc !== undefined && item.originalMcc !== item.mcc) {
    lines.push(`Original MCC: ${item.originalMcc}`);
  }

  return lines.join("\n");
}
