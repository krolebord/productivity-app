import { describe, expect, it } from "vitest";
import { DEFAULT_ASSISTANT_MODEL, getAssistantModel, isAssistantModelId, resolveAssistantModelId } from "./models";

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
