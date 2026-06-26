import { describe, expect, it } from "vitest";
import { decideMonobankImport, validateMonobankLink } from "./rules";

describe("validateMonobankLink", () => {
  it("rejects a currency mismatch", () => {
    const result = validateMonobankLink({
      monoCurrency: "UAH",
      appAccountCurrency: "USD",
      otherMonoAccountsLinkedToTarget: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an app account already linked to another Monobank account", () => {
    const result = validateMonobankLink({
      monoCurrency: "UAH",
      appAccountCurrency: "UAH",
      otherMonoAccountsLinkedToTarget: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported (empty) Monobank currency", () => {
    const result = validateMonobankLink({
      monoCurrency: "",
      appAccountCurrency: "",
      otherMonoAccountsLinkedToTarget: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("allows a matching, exclusive link", () => {
    const result = validateMonobankLink({
      monoCurrency: "UAH",
      appAccountCurrency: "UAH",
      otherMonoAccountsLinkedToTarget: 0,
    });
    expect(result.ok).toBe(true);
  });
});

describe("decideMonobankImport", () => {
  const base = {
    isHold: false,
    isZeroAmount: false,
    hasLink: true,
    linkedAccountExists: true,
    currencyMatches: true,
    uniqueLink: true,
    alreadyImported: false,
  };

  it("imports a valid, new, linked event", () => {
    expect(decideMonobankImport(base)).toEqual({ action: "import" });
  });

  it("skips when a visible (providerType, providerId) row already exists", () => {
    const decision = decideMonobankImport({ ...base, alreadyImported: true });
    expect(decision).toEqual({ action: "skip", reason: "duplicate", setError: false });
  });

  it("skips held and unlinked events without flagging an error", () => {
    expect(decideMonobankImport({ ...base, isHold: true })).toMatchObject({ action: "skip", setError: false });
    expect(decideMonobankImport({ ...base, hasLink: false })).toMatchObject({ action: "skip", setError: false });
  });

  it("flags configuration problems as errors", () => {
    expect(decideMonobankImport({ ...base, currencyMatches: false })).toMatchObject({ action: "skip", setError: true });
    expect(decideMonobankImport({ ...base, linkedAccountExists: false })).toMatchObject({
      action: "skip",
      setError: true,
    });
  });
});
