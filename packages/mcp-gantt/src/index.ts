import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGanttTools } from './register.js';

export const id = 'gantt' as const;

export function registerTools(server: McpServer): void {
  registerGanttTools(server);
}
