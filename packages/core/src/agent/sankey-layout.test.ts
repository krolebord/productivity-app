import { describe, expect, it } from "vitest";
import { resolveSankey } from "./chart-spec";
import { layoutSankey } from "./sankey-layout";

describe("resolveSankey", () => {
  it("keeps explicit node order, appends missing endpoints and drops self-links", () => {
    expect(
      resolveSankey({
        nodes: [{ name: "Expenses" }, { name: "Salary" }],
        links: [
          { source: "Salary", target: "Expenses", value: 80 },
          { source: "Salary", target: "Savings", value: 20 },
          { source: "Savings", target: "Savings", value: 5 },
        ],
      }),
    ).toEqual({
      nodes: [{ name: "Expenses" }, { name: "Salary" }, { name: "Savings" }],
      links: [
        { source: 1, target: 0, value: 80 },
        { source: 1, target: 2, value: 20 },
      ],
    });
  });

  it("returns null when nothing is left to draw", () => {
    expect(resolveSankey({ links: [{ source: "A", target: "A", value: 1 }] })).toBeNull();
  });
});

describe("layoutSankey", () => {
  const sankey = resolveSankey({
    links: [
      { source: "Salary", target: "Budget", value: 100 },
      { source: "Budget", target: "Rent", value: 60 },
      { source: "Budget", target: "Food", value: 40 },
      { source: "Bonus", target: "Food", value: 10 },
    ],
  });
  if (!sankey) throw new Error("expected a sankey");
  const layout = layoutSankey(sankey, { width: 200, height: 100, nodeWidth: 10, nodePadding: 0 });
  const node = (name: string) => layout.nodes.find((n) => n.name === name);

  it("places nodes in columns by depth, with sinks on the right", () => {
    expect(node("Salary")?.x).toBe(0);
    expect(node("Budget")?.x).toBe(95);
    expect(node("Rent")?.x).toBe(190);
    expect(node("Food")?.x).toBe(190);
    // Bonus is a source, so it stays in the first column.
    expect(node("Bonus")?.x).toBe(0);
  });

  it("scales heights to the most crowded column", () => {
    // The first column holds 110 (Salary + Bonus), which sets the scale to fill 100px.
    expect(node("Salary")?.height).toBeCloseTo(100 * (100 / 110));
    expect(node("Food")?.height).toBeCloseTo(50 * (100 / 110));
  });

  it("stacks links along each node edge", () => {
    const [, rent, food] = layout.links;
    expect(food.y0).toBeCloseTo(rent.y0 + rent.thickness);
    expect(rent.x0).toBe(105);
    expect(rent.x1).toBe(190);
  });
});

describe("layoutSankey in a crowded column", () => {
  it("shrinks the gaps so every flow keeps a visible thickness", () => {
    const sankey = resolveSankey({
      links: Array.from({ length: 19 }, (_, i) => ({ source: "Income", target: `Category ${i}`, value: 10 })),
    });
    if (!sankey) throw new Error("expected a sankey");
    const layout = layoutSankey(sankey, { width: 300, height: 240, nodePadding: 14 });

    // 18 gaps of 14px would leave -12px for the nodes; capped gaps leave half the height.
    expect(layout.links.every((link) => link.thickness > 0)).toBe(true);
    const targets = layout.nodes.filter((node) => node.name.startsWith("Category"));
    const bottom = Math.max(...targets.map((node) => node.y + node.height));
    expect(bottom).toBeLessThanOrEqual(240 + 1e-9);
    expect(targets.reduce((sum, node) => sum + node.height, 0)).toBeCloseTo(120);
  });
});
