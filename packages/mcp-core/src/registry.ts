import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type ProductId = 'charts' | 'gantt' | 'tree' | 'sankey' | 'grid';

export interface ProductModule {
  id: ProductId;
  registerTools(server: McpServer): void;
}
