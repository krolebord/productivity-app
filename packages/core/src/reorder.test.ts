import { describe, expect, it } from "vitest";
import { reorderByOrder } from "./reorder";

const rows = (...orders: number[]) => orders.map((order, i) => ({ id: String.fromCharCode(97 + i), order }));

describe("reorderByOrder", () => {
  it("slots the moved row between its new neighbours", () => {
    const { ordered, changes } = reorderByOrder(rows(1, 2, 3), 2, 0);
    expect(ordered.map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(changes).toEqual([{ id: "c", order: 0 }]);

    expect(reorderByOrder(rows(1, 2, 3), 0, 1).changes).toEqual([{ id: "a", order: 2.5 }]);
    expect(reorderByOrder(rows(1, 2, 3), 0, 2).changes).toEqual([{ id: "a", order: 4 }]);
  });

  it("renumbers the list when the neighbours share an order", () => {
    const { ordered, changes } = reorderByOrder(rows(1, 1, 1), 2, 1);
    expect(ordered.map((row) => [row.id, row.order])).toEqual([
      ["a", 1],
      ["c", 2],
      ["b", 3],
    ]);
    expect(changes).toHaveLength(3);
  });

  it("treats a null order as 0", () => {
    const list = [
      { id: "a", order: null },
      { id: "b", order: 2 },
      { id: "c", order: 4 },
    ];
    expect(reorderByOrder(list, 2, 1).changes).toEqual([{ id: "c", order: 1 }]);
    expect(reorderByOrder(list, 1, 0).changes).toEqual([{ id: "b", order: -1 }]);
  });
});
