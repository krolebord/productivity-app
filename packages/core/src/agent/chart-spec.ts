import { z } from "zod";

// Shared chart spec used by the agent's `renderChart` tool (server-side
// validation) and the <ChartCard /> renderer (client-side rendering). Keep this
// file dependency-light (zod only) so it bundles cleanly on the client.

const DataValue = z.union([z.string(), z.number(), z.null()]);

const ChartSeries = z.object({
  key: z
    .string()
    .min(1)
    .describe("Property name in each data row holding this series' numeric value. Use simple alphanumeric keys."),
  label: z.string().optional().describe("Human-readable series name shown in the legend and tooltip."),
  color: z
    .string()
    .optional()
    .describe("Optional CSS color (e.g. #8b5cf6). Defaults to the app's chart palette when omitted."),
});

const CartesianFields = {
  title: z.string().optional().describe("Short chart title."),
  description: z.string().optional().describe("Optional one-line caption shown under the title."),
  data: z
    .array(z.record(z.string(), DataValue))
    .min(1)
    .max(366)
    .describe("Already-aggregated rows. Each row is one point along the x axis; embed only summarized data."),
  xKey: z.string().min(1).describe("Key in each data row used for the x axis (category or time bucket)."),
  series: z
    .array(ChartSeries)
    .min(1)
    .max(8)
    .describe("One entry per plotted measure. Each series' key must exist in every data row."),
  stacked: z.boolean().optional().describe("Stack series on top of each other (bar/area only)."),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
};

const LineChartSpec = z.object({ type: z.literal("line"), ...CartesianFields });
const AreaChartSpec = z.object({ type: z.literal("area"), ...CartesianFields });
const BarChartSpec = z.object({ type: z.literal("bar"), ...CartesianFields });

const PieChartSpec = z.object({
  type: z.literal("pie"),
  title: z.string().optional().describe("Short chart title."),
  description: z.string().optional().describe("Optional one-line caption shown under the title."),
  donut: z.boolean().optional().describe("Render as a donut (hollow center) instead of a full pie."),
  data: z
    .array(
      z.object({
        name: z.string().min(1).describe("Slice label."),
        value: z.number().describe("Slice magnitude. Must be non-negative for a meaningful pie."),
        color: z.string().optional().describe("Optional CSS color; defaults to the chart palette."),
      }),
    )
    .min(1)
    .max(24)
    .describe("One entry per slice. Keep the slice count small for readability."),
});

const SankeyChartSpec = z.object({
  type: z.literal("sankey"),
  title: z.string().optional().describe("Short chart title."),
  description: z.string().optional().describe("Optional one-line caption shown under the title."),
  nodes: z
    .array(z.object({ name: z.string().min(1) }))
    .min(2)
    .max(60)
    .optional()
    .describe(
      "Optional explicit node list, controlling order and labels. If omitted, nodes are derived from the links.",
    ),
  links: z
    .array(
      z.object({
        source: z.string().min(1).describe("Name of the source node."),
        target: z.string().min(1).describe("Name of the target node."),
        value: z.number().positive().describe("Magnitude of the flow from source to target."),
      }),
    )
    .min(1)
    .max(200)
    .describe(
      "Directed flows between nodes, referenced by name. Must form an acyclic flow: a node may not (directly or transitively) flow back into itself.",
    ),
});

export const ChartSpecSchema = z.discriminatedUnion("type", [
  LineChartSpec,
  AreaChartSpec,
  BarChartSpec,
  PieChartSpec,
  SankeyChartSpec,
]);

export const RenderChartInputSchema = z.object({
  chart: ChartSpecSchema.describe("The chart to render."),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type CartesianChartSpec = Extract<ChartSpec, { type: "line" | "area" | "bar" }>;
export type PieChartSpecType = Extract<ChartSpec, { type: "pie" }>;
export type SankeyChartSpecType = Extract<ChartSpec, { type: "sankey" }>;

export type ResolvedSankey = {
  nodes: { name: string }[];
  /** Endpoints as indexes into `nodes`. */
  links: { source: number; target: number; value: number }[];
};

/**
 * Sankey layouts reference nodes by index; the spec uses names. Resolves them, appending any
 * link endpoint missing from the explicit node list and dropping self-links. Null when too
 * little is left to draw.
 */
export function resolveSankey(spec: Pick<SankeyChartSpecType, "nodes" | "links">): ResolvedSankey | null {
  const order: string[] = [];
  const indexByName = new Map<string, number>();
  const ensure = (name: string) => {
    const existing = indexByName.get(name);
    if (existing !== undefined) return existing;
    const next = order.length;
    indexByName.set(name, next);
    order.push(name);
    return next;
  };

  for (const node of spec.nodes ?? []) ensure(node.name);
  const links = spec.links
    .filter((link) => link.source !== link.target)
    .map((link) => ({ source: ensure(link.source), target: ensure(link.target), value: link.value }));
  const nodes = order.map((name) => ({ name }));

  if (nodes.length < 2 || links.length === 0) return null;
  return { nodes, links };
}

/**
 * Value-axis bounds for a cartesian chart, always including zero (recharts' default domain).
 * Stacks grow from zero both ways, so their bounds are the largest positive and negative
 * running totals per row rather than the extreme single value.
 */
export function cartesianValueBounds(
  rows: readonly (readonly (number | null)[])[],
  stacked: boolean,
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const values of rows) {
    if (stacked) {
      let positive = 0;
      let negative = 0;
      for (const value of values) {
        if (value == null) continue;
        if (value > 0) positive += value;
        else negative += value;
      }
      max = Math.max(max, positive);
      min = Math.min(min, negative);
    } else {
      for (const value of values) {
        if (value == null) continue;
        max = Math.max(max, value);
        min = Math.min(min, value);
      }
    }
  }
  return { min, max };
}
