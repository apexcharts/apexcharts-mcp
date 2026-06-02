/**
 * Input shape for apexsankey_generate_config.
 */
export interface GenerateSankeyConfigInput {
  /** Array of node objects `{ id, title, color? }`. If omitted, a 4-node placeholder is generated. */
  nodes?: unknown;
  /** Array of edge objects `{ source, target, value, type }`. If omitted, a placeholder flow is generated. */
  edges?: unknown;
  /** Canvas width. Numeric px or any CSS width string. Default '100%'. */
  width?: number | string;
  /** Canvas height. Numeric px or `'auto'` (≈1.6:1 from width). Default 'auto'. */
  height?: number | string;
  /** Horizontal gap between node columns (px). Default 20. */
  spacing?: number;
  /** Width of node rectangles (px). Default 20. */
  nodeWidth?: number;
  /** Toggle entrance animation. Default true. */
  animation?: boolean;
  /** Tooltip theme preset. */
  tooltipTheme?: 'light' | 'dark';
}

/**
 * Build a minimal valid ApexSankey config.
 *
 * The output object has two parts:
 *   - `options` — the constructor options (`new ApexSankey(el, options)`).
 *   - `data`    — the render payload (`sankey.render(data)`).
 *
 * When `nodes` / `edges` are omitted, a placeholder graph is generated so the
 * returned object renders something meaningful as-is.
 */
export function generateSankeyConfig(
  input: GenerateSankeyConfigInput,
): { options: Record<string, unknown>; data: { nodes: unknown[]; edges: unknown[] } } {
  const options: Record<string, unknown> = {
    width: input.width ?? '100%',
    height: input.height ?? 'auto',
  };

  if (input.spacing !== undefined) options.spacing = input.spacing;
  if (input.nodeWidth !== undefined) options.nodeWidth = input.nodeWidth;
  if (input.animation === false) options.animation = { enabled: false };
  if (input.tooltipTheme) options.tooltipTheme = input.tooltipTheme;

  const nodes = (input.nodes as unknown[] | undefined) ?? defaultNodes();
  const edges = (input.edges as unknown[] | undefined) ?? defaultEdges();

  return { options, data: { nodes, edges } };
}

function defaultNodes(): unknown[] {
  return [
    { id: 'source-a', title: 'Source A', color: '#4F46E5' },
    { id: 'source-b', title: 'Source B', color: '#0EA5E9' },
    { id: 'hub', title: 'Hub', color: '#10B981' },
    { id: 'sink-x', title: 'Sink X', color: '#F59E0B' },
    { id: 'sink-y', title: 'Sink Y', color: '#EF4444' },
  ];
}

function defaultEdges(): unknown[] {
  return [
    { source: 'source-a', target: 'hub', value: 10, type: 'flow' },
    { source: 'source-b', target: 'hub', value: 6, type: 'flow' },
    { source: 'hub', target: 'sink-x', value: 9, type: 'flow' },
    { source: 'hub', target: 'sink-y', value: 7, type: 'flow' },
  ];
}
