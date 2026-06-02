/**
 * Input shape for apextree_generate_config.
 */
export interface GenerateTreeConfigInput {
  /**
   * The root `NestedNode`. Every node needs `{ id, name, children: NestedNode[] }`.
   * Leaves must have `children: []` (not undefined, not omitted).
   * If omitted, a 3-level org-chart placeholder is generated.
   */
  data?: unknown;
  /** Canvas width. Default '100%'. */
  width?: number | string;
  /** Canvas height. Default 'auto'. */
  height?: number | string;
  /** Where the root sits and which way the tree grows. */
  direction?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Key on each node used as the label. Default `'name'`. Set to `'data'` to
   * activate the built-in org-card template (reads avatar/title/subtitle from
   * `node.data`).
   */
  contentKey?: string;
  /** Selection mode. Pass `false` to disable. */
  enableSelection?: 'single' | 'multi' | false;
  /** Built-in palette. */
  theme?: 'light' | 'dark' | 'custom';
  /** Connector shape. */
  edgeStyle?: 'orthogonal' | 'curved' | 'straight';
  /** Horizontal spacing between siblings (px). */
  siblingSpacing?: number;
  /** Vertical spacing between a node and its children (px). */
  childrenSpacing?: number;
  /** Node width (px). */
  nodeWidth?: number;
  /** Node height (px). */
  nodeHeight?: number;
  /** Show the zoom/pan/export toolbar. */
  enableToolbar?: boolean;
}

/**
 * Build a minimal valid ApexTree config.
 *
 * Output is split into `options` (passed to the constructor) and `data` (the
 * root NestedNode passed to `tree.render(data)`). When `data` is omitted, a
 * 3-level placeholder org chart is generated.
 */
export function generateTreeConfig(
  input: GenerateTreeConfigInput,
): { options: Record<string, unknown>; data: unknown } {
  const options: Record<string, unknown> = {
    width: input.width ?? '100%',
    height: input.height ?? 'auto',
    direction: input.direction ?? 'top',
  };

  if (input.contentKey !== undefined) options.contentKey = input.contentKey;
  if (input.enableSelection !== undefined) options.enableSelection = input.enableSelection;
  if (input.theme !== undefined) options.theme = input.theme;
  if (input.edgeStyle !== undefined) options.edgeStyle = input.edgeStyle;
  if (input.siblingSpacing !== undefined) options.siblingSpacing = input.siblingSpacing;
  if (input.childrenSpacing !== undefined) options.childrenSpacing = input.childrenSpacing;
  if (input.nodeWidth !== undefined) options.nodeWidth = input.nodeWidth;
  if (input.nodeHeight !== undefined) options.nodeHeight = input.nodeHeight;
  if (input.enableToolbar) options.enableToolbar = true;

  const data = input.data ?? defaultRoot();

  return { options, data };
}

function defaultRoot(): unknown {
  return {
    id: 'ceo',
    name: 'CEO',
    children: [
      {
        id: 'cto',
        name: 'CTO',
        children: [
          { id: 'eng-lead', name: 'Eng Lead', children: [] },
          { id: 'qa-lead', name: 'QA Lead', children: [] },
        ],
      },
      {
        id: 'cfo',
        name: 'CFO',
        children: [{ id: 'controller', name: 'Controller', children: [] }],
      },
      { id: 'cmo', name: 'CMO', children: [] },
    ],
  };
}
