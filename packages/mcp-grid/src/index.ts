import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGridTools } from './register.js';

export const id = 'grid' as const;

export function registerTools(server: McpServer): void {
  registerGridTools(server);
}
