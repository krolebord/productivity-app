import { describe, expect, it } from "vitest";
import { appendToDraft, formatAttachToken } from "./attach";
import { BUILTIN_SKILLS, findBuiltinSkill, skillStarterPrompt, skillStarters } from "./builtin-skills";
import { inlineTransactionRecord } from "./transactions-spec";

describe("attaching context", () => {
  it("formats the token the assistant resolves", () => {
    expect(formatAttachToken({ table: "item", id: "n1" })).toBe("@item:n1");
  });

  it("appends space-separated with a trailing space", () => {
    expect(appendToDraft("", "@item:n1")).toBe("@item:n1 ");
    expect(appendToDraft("Summarize", "@item:n1")).toBe("Summarize @item:n1 ");
    expect(appendToDraft("Summarize\n", "@item:n1")).toBe("Summarize\n@item:n1 ");
  });
});

describe("skill starters", () => {
  it("lists user skills before built-ins", () => {
    const starters = skillStarters([{ id: "s1", name: "Weekly review", whenToUse: "Fridays" }]);
    expect(starters[0].id).toBe("s1");
    expect(starters.slice(1).every((skill) => skill.id.startsWith("builtin-"))).toBe(true);
  });

  it("names untitled skills", () => {
    expect(skillStarterPrompt({ name: "Weekly review" })).toBe('Use the "Weekly review" skill.');
    expect(skillStarterPrompt({ name: "" })).toBe('Use the "Untitled" skill.');
  });
});

describe("built-in skills", () => {
  it("use ids that are valid Agent Skills names", () => {
    for (const skill of BUILTIN_SKILLS) expect(skill.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("still resolves ids stored before the rename", () => {
    expect(findBuiltinSkill("builtin:import-transactions")?.name).toBe("Import transactions");
    expect(findBuiltinSkill("builtin-import-transactions")?.name).toBe("Import transactions");
  });
});

describe("inlineTransactionRecord", () => {
  const base = { kind: "inline", title: "Coffee", amount: 4, currency: "EUR" } as const;

  it("signs the amount by type", () => {
    expect(inlineTransactionRecord({ ...base, type: "expense" }, 0).amount).toBe(-4);
    expect(inlineTransactionRecord({ ...base, type: "transfer" }, 0).amount).toBe(-4);
    expect(inlineTransactionRecord({ ...base, type: "income" }, 0).amount).toBe(4);
  });

  it("defaults the date to now", () => {
    expect(inlineTransactionRecord({ ...base, type: "expense" }, 123).effectiveAt).toBe(123);
    expect(inlineTransactionRecord({ ...base, type: "expense", effectiveAt: 5 }, 123).effectiveAt).toBe(5);
  });
});
