import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type ProductId = 'charts' | 'gantt' | 'tree' | 'sankey' | 'grid' | 'stock';

export interface ProductMetadata {
  /** Human-facing display name (e.g. "ApexCharts", "ApexGantt"). */
  name: string;
  /** One-line "when to pick this product" decision aid for AI clients. */
  useFor: string;
  /** The tool names this product registers, in the order they appear in tools/list. */
  tools: string[];
  /** Link to the public docs for this product. */
  docs?: string;
}

import type { SkillCompatibility } from './compatibility.js';

export interface ProductModule {
  id: ProductId;
  metadata: ProductMetadata;
  registerTools(server: McpServer): void;
  /**
   * Resolve which upstream library version this product's bundled skill was
   * verified against. Read at runtime from the skill package's SKILL.md, so it
   * can't drift from the docs. Surfaced by `apexcharts_list_products`.
   */
  readCompatibility?(): Promise<SkillCompatibility>;
}
