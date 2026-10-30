import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MODELS,
  DEFAULT_ASSISTANT_MODEL,
  displayedReasoningEffort,
  getAssistantModel,
  isAssistantModelId,
  modelSupportsSelectableReasoning,
  preferredConversationReasoningEffort,
  resolveAssistantModelId,
} from "./models";

describe("resolveAssistantModelId", () => {
  it("keeps catalog ids", () => {
    expect(resolveAssistantModelId("z-ai/glm-5.3-flash")).toBe("z-ai/glm-5.3-flash");
  });

  it("maps retired aliases onto their catalog model", () => {
    expect(resolveAssistantModelId("stealth/ox-alpha")).toBe("z-ai/glm-5.3-flash");
    expect(getAssistantModel("stealth/ox-alpha")?.label).toBe("GLM 5.3 Flash");
  });

  it("falls back to the default for unknown ids", () => {
    expect(resolveAssistantModelId("nope")).toBe(DEFAULT_ASSISTANT_MODEL);
    expect(resolveAssistantModelId(null)).toBe(DEFAULT_ASSISTANT_MODEL);
  });
});

describe("isAssistantModelId", () => {
  it("accepts catalog ids and rejects aliases", () => {
    expect(isAssistantModelId("z-ai/glm-5.3-flash")).toBe(true);
    expect(isAssistantModelId("stealth/ox-alpha")).toBe(false);
  });
});

describe("reasoning effort", () => {
  // GPT-5.6 Luna has a selectable effort with a catalog default of "high".
  const selectable = "openai/gpt-5.6-luna";

  it("sends the preference only for models with a toggle", () => {
    expect(modelSupportsSelectableReasoning(selectable)).toBe(true);
    expect(preferredConversationReasoningEffort(selectable, "low")).toBe("low");
    expect(preferredConversationReasoningEffort(selectable, "bogus")).toBe("high");
    const fixed = ASSISTANT_MODELS.find((model) => !modelSupportsSelectableReasoning(model.id));
    if (fixed) expect(preferredConversationReasoningEffort(fixed.id, "low")).toBeNull();
  });

  it("shows the conversation's own effort over the preference", () => {
    expect(displayedReasoningEffort(selectable, "low", "medium")).toBe("low");
    expect(displayedReasoningEffort(selectable, null, "medium")).toBe("medium");
    expect(displayedReasoningEffort(selectable, null, null)).toBe("high");
  });
});
