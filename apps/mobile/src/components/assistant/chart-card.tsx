import {
  type CartesianChartSpec,
  ChartSpecSchema,
  cartesianValueBounds,
  type PieChartSpecType,
  resolveSankey,
  type SankeyChartSpecType,
} from "@productivity/core/agent/chart-spec";
import { layoutSankey } from "@productivity/core/agent/sankey-layout";
import { type ReactNode, useState } from "react";
import { Text, View } from "react-native";
import { Canvas, Group, Path, Rect, Text as SkiaText } from "react-native-skia";
import {
  Area,
  Bar,
  BarGroup,
  CartesianChart,
  Line,
  Pie,
  PolarChart,
  StackedArea,
  StackedBar,
  useChartPressState,
} from "victory-native";
import {
  axes,
  axisFont,
  ColumnHighlight,
  DetailRow,
  Details,
  DOMAIN_PADDING,
  Legend,
  PRESS_CONFIG,
  ROUNDED,
  slotWidth,
  useChartTheme,
  useSelectedIndex,
} from "../overview-charts";
import { ToolErrorChip } from "./tool-chip";

type SeriesKey = `s${number}`;
type ChartRow = { label: string } & Record<SeriesKey, number | null>;

function formatValue(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ChartFrame({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <View className="w-full gap-2 rounded-xl border border-border bg-card p-3">
      {(title || description) && (
        <View>
          {title && <Text className="font-medium text-foreground text-sm">{title}</Text>}
          {description && <Text className="text-muted-foreground text-xs">{description}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

function CartesianCard({ spec }: { spec: CartesianChartSpec }) {
  const theme = useChartTheme();
  const colorAt = (index: number) => spec.series[index].color || theme.palette[index % theme.palette.length];
  // Series keys come from the model, so they're renamed to fixed keys the chart can type.
  const keys = spec.series.map((_, index) => `s${index}` as SeriesKey);
  const data: ChartRow[] = spec.data.map((row) => {
    const out = { label: String(row[spec.xKey] ?? "") } as ChartRow;
    spec.series.forEach((series, index) => {
      const value = row[series.key];
      out[keys[index]] = typeof value === "number" ? value : value == null ? null : Number(value) || 0;
    });
    return out;
  });
  const { state } = useChartPressState({ x: "", y: Object.fromEntries(keys.map((key) => [key, 0])) });
  const pressed = useSelectedIndex(state, data);
  const row = data[pressed ?? data.length - 1];
  const stacked = spec.stacked === true && spec.type !== "line";
  // Victory offsets each stacked series by the ones below it and reads a gap there as a 0 at
  // the wrong height, so stacks draw missing values as 0; the details still show "—".
  const chartData = stacked
    ? data.map((item) => {
        const filled = { ...item };
        for (const key of keys) filled[key] = item[key] ?? 0;
        return filled;
      })
    : data;
  const bounds = cartesianValueBounds(
    data.map((item) => keys.map((key) => item[key])),
    stacked,
  );
  const [width, setWidth] = useState(0);
  // Bars are centered on their x points, so pad the edges by half a slot to keep the outer
  // bars (and side-by-side groups) inside the plot. The y axis takes roughly 44px.
  const edge =
    spec.type === "bar" ? Math.max(DOMAIN_PADDING.left, (width - 44) / data.length / 2) : DOMAIN_PADDING.left;

  return (
    <ChartFrame title={spec.title} description={spec.description}>
      <View className="h-52" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <CartesianChart
          data={chartData}
          xKey="label"
          yKeys={keys}
          // A flat all-zero series has no span, so let the chart pick the top then.
          domain={{ y: bounds.max > bounds.min ? [bounds.min, bounds.max] : [bounds.min] }}
          domainPadding={{ ...DOMAIN_PADDING, left: edge, right: edge }}
          chartPressState={state}
          chartPressConfig={PRESS_CONFIG}
          {...axes(theme, Math.min(data.length, 6))}
        >
          {({ points, chartBounds, yScale }) => {
            const series = keys.map((key) => points[key]);
            if (spec.type === "line") {
              return series.map((line, index) => (
                <Line key={keys[index]} points={line} curveType="monotoneX" color={colorAt(index)} strokeWidth={2} />
              ));
            }
            if (spec.type === "area") {
              if (stacked) {
                return (
                  <StackedArea
                    points={series}
                    y0={yScale(0)}
                    curveType="monotoneX"
                    colors={keys.map((_, index) => colorAt(index))}
                    areaOptions={() => ({ opacity: 0.5 })}
                  />
                );
              }
              return series.map((area, index) => (
                <Group key={keys[index]}>
                  <Area points={area} y0={yScale(0)} curveType="monotoneX" color={colorAt(index)} opacity={0.25} />
                  <Line points={area} curveType="monotoneX" color={colorAt(index)} strokeWidth={2} />
                </Group>
              ));
            }
            const highlight = (
              <ColumnHighlight points={series[0]} index={pressed} chartBounds={chartBounds} color={theme.grid} />
            );
            if (stacked) {
              return (
                <>
                  {highlight}
                  <StackedBar
                    points={series}
                    chartBounds={chartBounds}
                    barWidth={Math.min(20, slotWidth(series[0], chartBounds) * 0.6)}
                    colors={keys.map((_, index) => colorAt(index))}
                  />
                </>
              );
            }
            if (series.length === 1) {
              return (
                <>
                  {highlight}
                  <Bar
                    points={series[0]}
                    chartBounds={chartBounds}
                    barWidth={Math.min(20, slotWidth(series[0], chartBounds) * 0.6)}
                    color={colorAt(0)}
                    roundedCorners={ROUNDED}
                  />
                </>
              );
            }
            return (
              <>
                {highlight}
                <BarGroup chartBounds={chartBounds} betweenGroupPadding={0.3} withinGroupPadding={0.1}>
                  {series.map((bars, index) => (
                    <BarGroup.Bar key={keys[index]} points={bars} color={colorAt(index)} />
                  ))}
                </BarGroup>
              </>
            );
          }}
        </CartesianChart>
      </View>
      {spec.series.length > 1 && (
        <Legend
          items={spec.series.map((series, index) => ({ color: colorAt(index), label: series.label ?? series.key }))}
        />
      )}
      {row && (
        <Details title={row.label}>
          {spec.series.map((series, index) => (
            <DetailRow
              key={keys[index]}
              color={colorAt(index)}
              label={series.label ?? series.key}
              value={formatValue(row[keys[index]])}
            />
          ))}
        </Details>
      )}
    </ChartFrame>
  );
}

function PieCard({ spec }: { spec: PieChartSpecType }) {
  const theme = useChartTheme();
  const data = spec.data.map((slice, index) => ({
    label: slice.name,
    value: Math.max(0, slice.value),
    color: slice.color || theme.palette[index % theme.palette.length],
  }));
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <ChartFrame title={spec.title} description={spec.description}>
      <View className="h-48">
        <PolarChart data={data} labelKey="label" valueKey="value" colorKey="color">
          <Pie.Chart innerRadius={spec.donut ? "55%" : 0} />
        </PolarChart>
      </View>
      <View className="gap-1.5">
        {data.map((slice) => (
          <DetailRow
            key={slice.label}
            color={slice.color}
            label={slice.label}
            hint={total > 0 ? `(${((slice.value / total) * 100).toFixed(0)}%)` : undefined}
            value={formatValue(slice.value)}
          />
        ))}
      </View>
    </ChartFrame>
  );
}

const SANKEY_HEIGHT = 240;
const SANKEY_LABEL_GAP = 4;

/** Flows drawn on a Skia canvas from core's layout; victory-native has no sankey. */
function SankeyCard({ spec }: { spec: SankeyChartSpecType }) {
  const theme = useChartTheme();
  const [width, setWidth] = useState(0);
  const sankey = resolveSankey(spec);
  if (!sankey) return <ToolErrorChip label="Could not render chart" />;
  const layout = width > 0 ? layoutSankey(sankey, { width, height: SANKEY_HEIGHT, nodePadding: 14 }) : null;

  return (
    <ChartFrame title={spec.title} description={spec.description}>
      <View style={{ height: SANKEY_HEIGHT }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {layout && (
          <Canvas style={{ width, height: SANKEY_HEIGHT }}>
            {layout.links.map((link, index) => {
              const mid = (link.x0 + link.x1) / 2;
              const bottom0 = link.y0 + link.thickness;
              const bottom1 = link.y1 + link.thickness;
              // A band: the top edge eases across, then the bottom edge eases back.
              const path = [
                `M ${link.x0} ${link.y0}`,
                `C ${mid} ${link.y0} ${mid} ${link.y1} ${link.x1} ${link.y1}`,
                `L ${link.x1} ${bottom1}`,
                `C ${mid} ${bottom1} ${mid} ${bottom0} ${link.x0} ${bottom0}`,
                "Z",
              ].join(" ");
              return (
                <Path
                  key={index}
                  path={path}
                  color={theme.palette[link.source % theme.palette.length]}
                  opacity={0.25}
                />
              );
            })}
            {layout.nodes.map((node) => {
              const color = theme.palette[node.index % theme.palette.length];
              const textWidth = axisFont.measureText(node.name).width;
              // Labels sit outside the node, flipped inward at the right edge.
              const outside = node.x + node.width + SANKEY_LABEL_GAP + textWidth > width;
              return (
                <Group key={node.name}>
                  <Rect x={node.x} y={node.y} width={node.width} height={Math.max(1, node.height)} color={color} />
                  <SkiaText
                    x={outside ? node.x - SANKEY_LABEL_GAP - textWidth : node.x + node.width + SANKEY_LABEL_GAP}
                    y={node.y + node.height / 2 + 4}
                    text={node.name}
                    font={axisFont}
                    color={theme.label}
                  />
                </Group>
              );
            })}
          </Canvas>
        )}
      </View>
    </ChartFrame>
  );
}

/** The agent's `renderChart` output, mirroring the web's recharts card. */
export function ChartCard({ spec: rawSpec }: { spec: unknown }) {
  const parsed = ChartSpecSchema.safeParse(rawSpec);
  if (!parsed.success) return <ToolErrorChip label="Could not render chart" />;

  const spec = parsed.data;
  switch (spec.type) {
    case "pie":
      return <PieCard spec={spec} />;
    case "sankey":
      return <SankeyCard spec={spec} />;
    default:
      return <CartesianCard spec={spec} />;
  }
}
