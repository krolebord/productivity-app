import {
  type CartesianChartSpec,
  ChartSpecSchema,
  type PieChartSpecType,
  type SankeyChartSpecType,
} from "@productivity/core/agent/chart-spec";
import { CircleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Layer,
  Line,
  LineChart,
  Pie,
  PieChart,
  Rectangle,
  Sankey,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart";

const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function colorAt(index: number, explicit?: string) {
  return explicit || PALETTE[index % PALETTE.length];
}

function ChartFrame({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="w-full rounded-lg border bg-card p-3">
      {(title || description) && (
        <figcaption className="mb-2">
          {title && <div className="font-medium text-sm">{title}</div>}
          {description && <div className="text-muted-foreground text-xs">{description}</div>}
        </figcaption>
      )}
      {children}
    </figure>
  );
}

function CartesianChart({ spec }: { spec: CartesianChartSpec }) {
  const config: ChartConfig = {};
  spec.series.forEach((series, i) => {
    config[series.key] = { label: series.label ?? series.key, color: colorAt(i, series.color) };
  });

  const showLegend = spec.series.length > 1;

  return (
    <ChartFrame title={spec.title} description={spec.description}>
      <ChartContainer config={config} className="aspect-video w-full">
        {spec.type === "line" ? (
          <LineChart accessibilityLayer data={spec.data} margin={{ left: 4, right: 12, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={44} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            {spec.series.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stroke={`var(--color-${series.key})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : spec.type === "area" ? (
          <AreaChart accessibilityLayer data={spec.data} margin={{ left: 4, right: 12, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={44} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            {spec.series.map((series) => (
              <Area
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stackId={spec.stacked ? "a" : undefined}
                stroke={`var(--color-${series.key})`}
                fill={`var(--color-${series.key})`}
                fillOpacity={0.25}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart accessibilityLayer data={spec.data} margin={{ left: 4, right: 12, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={44} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            {spec.series.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                stackId={spec.stacked ? "a" : undefined}
                fill={`var(--color-${series.key})`}
                radius={spec.stacked ? 0 : 4}
              />
            ))}
          </BarChart>
        )}
      </ChartContainer>
    </ChartFrame>
  );
}

function PieChartView({ spec }: { spec: PieChartSpecType }) {
  const config: ChartConfig = {};
  spec.data.forEach((slice, i) => {
    config[slice.name] = { label: slice.name, color: colorAt(i, slice.color) };
  });

  return (
    <ChartFrame title={spec.title} description={spec.description}>
      <ChartContainer config={config} className="mx-auto aspect-square max-h-72">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Pie data={spec.data} dataKey="value" nameKey="name" innerRadius={spec.donut ? 56 : 0}>
            {spec.data.map((slice, i) => (
              <Cell key={slice.name} fill={colorAt(i, slice.color)} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
        </PieChart>
      </ChartContainer>
    </ChartFrame>
  );
}

// Recharts injects these geometry props when it clones the `node` element.
type SankeyNodeProps = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: { name: string };
  containerWidth: number;
}>;

function SankeyNode({ x = 0, y = 0, width = 0, height = 0, index = 0, payload, containerWidth = 0 }: SankeyNodeProps) {
  // Flip the label to the inner side when the node sits at the right edge.
  const labelOutside = x + width + 6 > containerWidth;
  return (
    <Layer key={`sankey-node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={colorAt(index)} fillOpacity={0.9} radius={2} />
      <text
        x={labelOutside ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={labelOutside ? "end" : "start"}
        dominantBaseline="middle"
        className="fill-foreground text-[11px]"
      >
        {payload?.name}
      </text>
    </Layer>
  );
}

function SankeyChartView({ spec }: { spec: SankeyChartSpecType }) {
  // Recharts links reference nodes by index; the spec uses names, so resolve
  // them here and append any link endpoints missing from the explicit node list.
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

  if (nodes.length < 2 || links.length === 0) {
    return <ChartError />;
  }

  return (
    <ChartFrame title={spec.title} description={spec.description}>
      <ChartContainer config={{}} className="aspect-video w-full">
        <Sankey
          data={{ nodes, links }}
          nodePadding={24}
          margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
          node={<SankeyNode />}
          link={{ stroke: "var(--color-chart-2)", strokeOpacity: 0.2 }}
        >
          <ChartTooltip content={<ChartTooltipContent />} />
        </Sankey>
      </ChartContainer>
    </ChartFrame>
  );
}

function ChartError() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
      <CircleAlert className="size-3 text-destructive" />
      Could not render chart
    </div>
  );
}

export default function ChartCard({ spec: rawSpec }: { spec: unknown }) {
  const parsed = ChartSpecSchema.safeParse(rawSpec);

  if (!parsed.success) {
    return <ChartError />;
  }

  const spec = parsed.data;
  switch (spec.type) {
    case "pie":
      return <PieChartView spec={spec} />;
    case "sankey":
      return <SankeyChartView spec={spec} />;
    default:
      return <CartesianChart spec={spec} />;
  }
}
