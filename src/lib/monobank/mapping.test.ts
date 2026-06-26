import { describe, expect, it } from "vitest";
import { formatMonobankNotes, mapStatementItemToTransaction } from "./mapping";
import type { MonobankStatementItem } from "./types";

function statementItem(overrides: Partial<MonobankStatementItem>): MonobankStatementItem {
  return {
    id: "tx-1",
    time: 1554466347,
    description: "Coffee",
    amount: -95000,
    ...overrides,
  };
}

describe("mapStatementItemToTransaction", () => {
  it("maps negative minor units to an expense in major units", () => {
    const mapped = mapStatementItemToTransaction(statementItem({ amount: -95000 }));
    expect(mapped).not.toBeNull();
    expect(mapped?.type).toBe("expense");
    expect(mapped?.amount).toBe(-950);
    expect(mapped?.effectiveAt).toBe(1554466347 * 1000);
    expect(mapped?.title).toBe("Coffee");
  });

  it("maps positive minor units to income in major units", () => {
    const mapped = mapStatementItemToTransaction(statementItem({ amount: 12345 }));
    expect(mapped?.type).toBe("income");
    expect(mapped?.amount).toBe(123.45);
  });

  it("skips zero-amount items", () => {
    expect(mapStatementItemToTransaction(statementItem({ amount: 0 }))).toBeNull();
  });

  it("skips held authorizations", () => {
    expect(mapStatementItemToTransaction(statementItem({ amount: -100, hold: true }))).toBeNull();
  });
});

describe("formatMonobankNotes", () => {
  it("includes comment, receipt id and mcc", () => {
    const notes = formatMonobankNotes({ comment: "Lunch", receiptId: "r-1", mcc: 5411 });
    expect(notes).toBe("Comment: Lunch\nReceipt: r-1\nMCC: 5411");
  });

  it("does not duplicate the title/description", () => {
    const notes = formatMonobankNotes({ comment: "Lunch", mcc: 5411 });
    expect(notes).not.toContain("Coffee");
  });

  it("includes Original MCC only when present and different from mcc", () => {
    expect(formatMonobankNotes({ mcc: 5411, originalMcc: 5411 })).toBe("MCC: 5411");
    expect(formatMonobankNotes({ mcc: 5411, originalMcc: 4829 })).toBe("MCC: 5411\nOriginal MCC: 4829");
  });

  it("is empty when there are no extra details", () => {
    expect(formatMonobankNotes({})).toBe("");
  });
});
