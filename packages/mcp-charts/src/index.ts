import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChartsTools } from './register.js';

export const id = 'charts' as const;

export function registerTools(server: McpServer): void {
  registerChartsTools(server);
}
