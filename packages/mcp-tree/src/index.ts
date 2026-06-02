import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTreeTools } from './register.js';

export const id = 'tree' as const;

export function registerTools(server: McpServer): void {
  registerTreeTools(server);
}
