import { describe, expect, it } from "vitest";
import { cartesianValueBounds } from "./chart-spec";

describe("cartesianValueBounds", () => {
  it("keeps zero in range for all-positive and all-negative data", () => {
    expect(cartesianValueBounds([[3], [7]], false)).toEqual({ min: 0, max: 7 });
    expect(cartesianValueBounds([[-3], [-7, null]], false)).toEqual({ min: -7, max: 0 });
  });

  it("uses each row's running totals when stacked", () => {
    expect(
      cartesianValueBounds(
        [
          [-100, -100, 50],
          [30, 40, -10],
        ],
        true,
      ),
    ).toEqual({ min: -200, max: 70 });
  });

  it("is zero-width with no data", () => {
    expect(cartesianValueBounds([], true)).toEqual({ min: 0, max: 0 });
  });
});
