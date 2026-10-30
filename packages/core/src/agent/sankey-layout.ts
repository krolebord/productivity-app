import type { ResolvedSankey } from "./chart-spec";

export type SankeyNodeBox = { name: string; index: number; x: number; y: number; width: number; height: number };

export type SankeyLinkBand = {
  source: number;
  target: number;
  value: number;
  /** Left and right edges of the band, and its top on each side; `thickness` is its height. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  thickness: number;
};

export type SankeyLayout = { nodes: SankeyNodeBox[]; links: SankeyLinkBand[] };

/**
 * A small sankey layout for renderers without one (recharts has its own): nodes sit in columns
 * by their longest path from a source, sized by the larger of their in- and outflow, and links
 * stack along each node edge in input order. Assumes the acyclic flow the spec requires; a
 * cycle just stops deepening after `nodes.length` passes instead of looping.
 */
export function layoutSankey(
  sankey: ResolvedSankey,
  size: { width: number; height: number; nodeWidth?: number; nodePadding?: number },
): SankeyLayout {
  const nodeWidth = size.nodeWidth ?? 8;
  const requestedPadding = size.nodePadding ?? 12;
  const count = sankey.nodes.length;

  const depth = new Array<number>(count).fill(0);
  for (let pass = 0; pass < count; pass++) {
    let changed = false;
    for (const link of sankey.links) {
      if (depth[link.target] < depth[link.source] + 1) {
        depth[link.target] = depth[link.source] + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Pull sinks to the last column, so every terminal flow ends at the right edge.
  const maxDepth = Math.max(0, ...depth);
  const hasOutflow = new Set(sankey.links.map((link) => link.source));
  for (let i = 0; i < count; i++) if (!hasOutflow.has(i)) depth[i] = maxDepth;

  const inflow = new Array<number>(count).fill(0);
  const outflow = new Array<number>(count).fill(0);
  for (const link of sankey.links) {
    outflow[link.source] += link.value;
    inflow[link.target] += link.value;
  }
  const value = sankey.nodes.map((_, i) => Math.max(inflow[i], outflow[i]));

  const columns: number[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (let i = 0; i < count; i++) columns[depth[i]].push(i);

  // Gaps shrink in crowded columns so they never take more than half the height, which
  // would otherwise squeeze the scale (and every flow) down to nothing.
  const tallest = Math.max(1, ...columns.map((column) => column.length));
  const nodePadding = tallest > 1 ? Math.min(requestedPadding, size.height / 2 / (tallest - 1)) : requestedPadding;

  // One vertical scale for the whole chart, set by the most crowded column.
  const scale = Math.min(
    ...columns
      .filter((column) => column.length > 0)
      .map((column) => {
        const total = column.reduce((sum, i) => sum + value[i], 0);
        const room = size.height - (column.length - 1) * nodePadding;
        return total > 0 ? Math.max(0, room) / total : Number.POSITIVE_INFINITY;
      }),
  );
  const ky = Number.isFinite(scale) ? scale : 0;

  const columnStep = maxDepth > 0 ? (size.width - nodeWidth) / maxDepth : 0;
  const nodes: SankeyNodeBox[] = new Array(count);
  for (const column of columns) {
    const used = column.reduce((sum, i) => sum + value[i] * ky, 0) + (column.length - 1) * nodePadding;
    // Center short columns vertically instead of bunching them at the top.
    let y = Math.max(0, (size.height - used) / 2);
    for (const i of column) {
      const height = value[i] * ky;
      nodes[i] = { name: sankey.nodes[i].name, index: i, x: depth[i] * columnStep, y, width: nodeWidth, height };
      y += height + nodePadding;
    }
  }

  const sourceOffset = new Array<number>(count).fill(0);
  const targetOffset = new Array<number>(count).fill(0);
  const links = sankey.links.map((link) => {
    const thickness = link.value * ky;
    const source = nodes[link.source];
    const target = nodes[link.target];
    const band = {
      source: link.source,
      target: link.target,
      value: link.value,
      x0: source.x + source.width,
      x1: target.x,
      y0: source.y + sourceOffset[link.source],
      y1: target.y + targetOffset[link.target],
      thickness,
    };
    sourceOffset[link.source] += thickness;
    targetOffset[link.target] += thickness;
    return band;
  });

  return { nodes, links };
}
