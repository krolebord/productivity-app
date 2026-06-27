/**
 * Pure decision logic shared by the client-side link helper and the server-side import job.
 * Keeping these rules free of DB access makes them unit-testable and keeps the two call sites
 * consistent. The import job always re-checks every rule before inserting, regardless of what the
 * link helper allowed.
 */

export type LinkValidation = { ok: true } | { ok: false; error: string };

/**
 * Decide whether a Monobank account may be linked to an in-app account.
 * Pass an empty `linkedAccountId` to unlink — callers should skip validation in that case.
 */
export function validateMonobankLink(input: {
  /** monobank_account.currency (alpha, or "" when unsupported). */
  monoCurrency: string;
  /** Target in-app account.currency. */
  appAccountCurrency: string;
  /** Number of *other* Monobank accounts already linked to the target app account. */
  otherMonoAccountsLinkedToTarget: number;
}): LinkValidation {
  if (!input.monoCurrency) {
    return { ok: false, error: "This Monobank account uses an unsupported currency." };
  }

  if (input.monoCurrency !== input.appAccountCurrency) {
    return { ok: false, error: "Currencies must match to link this account." };
  }

  if (input.otherMonoAccountsLinkedToTarget > 0) {
    return { ok: false, error: "That account is already linked to another Monobank account." };
  }

  return { ok: true };
}

export type ImportDecision = { action: "import" } | { action: "skip"; reason: string; setError: boolean };

/**
 * Decide whether a webhook statement event should be imported. `setError` indicates whether the
 * skip reflects a real configuration/validation problem worth surfacing on the account row (vs a
 * normal skip such as a zero-amount, unlinked account, or duplicate event).
 *
 * Held authorizations are NOT skipped: Monobank's real-time webhook arrives while the transaction
 * is still on hold, and a cleared (`hold:false`) follow-up is not reliably sent — skipping holds
 * would import almost nothing. A later cleared event for the same id is absorbed by the dedupe.
 */
export function decideMonobankImport(input: {
  isZeroAmount: boolean;
  hasLink: boolean;
  linkedAccountExists: boolean;
  currencyMatches: boolean;
  uniqueLink: boolean;
  alreadyImported: boolean;
}): ImportDecision {
  if (input.isZeroAmount) {
    return { action: "skip", reason: "zero-amount", setError: false };
  }
  if (!input.hasLink) {
    return { action: "skip", reason: "unlinked", setError: false };
  }
  if (!input.linkedAccountExists) {
    return { action: "skip", reason: "linked-account-missing", setError: true };
  }
  if (!input.currencyMatches) {
    return { action: "skip", reason: "currency-mismatch", setError: true };
  }
  if (!input.uniqueLink) {
    return { action: "skip", reason: "ambiguous-link", setError: true };
  }
  if (input.alreadyImported) {
    return { action: "skip", reason: "duplicate", setError: false };
  }
  return { action: "import" };
}
