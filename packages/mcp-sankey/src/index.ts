import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSankeyTools } from './register.js';

export const id = 'sankey' as const;

export function registerTools(server: McpServer): void {
  registerSankeyTools(server);
}
