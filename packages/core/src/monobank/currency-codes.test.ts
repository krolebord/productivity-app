import { describe, expect, it } from "vitest";
import { numericToAlphaCurrency } from "./currency-codes";

describe("numericToAlphaCurrency", () => {
  it("maps known ISO 4217 numeric codes to the app alpha code", () => {
    expect(numericToAlphaCurrency(980)).toBe("UAH");
    expect(numericToAlphaCurrency(840)).toBe("USD");
    expect(numericToAlphaCurrency(978)).toBe("EUR");
  });

  it("treats unknown numeric codes as unsupported", () => {
    expect(numericToAlphaCurrency(999)).toBeNull();
    expect(numericToAlphaCurrency(0)).toBeNull();
  });
});
