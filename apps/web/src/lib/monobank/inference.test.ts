import { generateText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inferServerMonobankClassification } from "./inference";

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => ({
    chat: () => "test-model",
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: (definition: unknown) => definition,
  },
}));

type ServerMonobankDb = Parameters<typeof inferServerMonobankClassification>[0];

function sequenceDb(rowsByCall: unknown[][]): ServerMonobankDb {
  const calls = [...rowsByCall];

  return {
    executeKysely: () => ({ rows: calls.shift() ?? [] }),
  } as unknown as ServerMonobankDb;
}

describe("inferServerMonobankClassification", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it("uses importance from the latest same-title Monobank transaction", async () => {
    const db = sequenceDb([[{ category: "Groceries", importance: "flexible" }]]);

    await expect(
      inferServerMonobankClassification(
        db,
        { OPENROUTER_API_KEY: "test-key" },
        {
          title: "Silpo",
          type: "expense",
          amount: -123,
          mcc: 5411,
        },
      ),
    ).resolves.toEqual({ category: "Groceries", importance: "flexible" });

    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses the latest category importance for an LLM-inferred category", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { category: "Groceries" } } as Awaited<
      ReturnType<typeof generateText>
    >);
    const db = sequenceDb([[], [{ category: "Groceries" }, { category: "Transport" }], [{ importance: "fixed" }]]);

    await expect(
      inferServerMonobankClassification(
        db,
        { OPENROUTER_API_KEY: "test-key" },
        {
          title: "Silpo",
          type: "expense",
          amount: -123,
          mcc: 5411,
        },
      ),
    ).resolves.toEqual({ category: "Groceries", importance: "fixed" });
  });
});
