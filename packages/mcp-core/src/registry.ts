import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type ProductId = 'charts' | 'gantt' | 'tree' | 'sankey' | 'grid';

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

export interface ProductModule {
  id: ProductId;
  metadata: ProductMetadata;
  registerTools(server: McpServer): void;
}
