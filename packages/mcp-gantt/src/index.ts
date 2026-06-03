import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerGanttTools } from './register.js';

export const id = 'gantt' as const;

export const metadata: ProductMetadata = {
  name: 'ApexGantt',
  useFor:
    'Project schedules and Gantt charts: tasks, hierarchy (parentId), FS/SS/FF/SF dependencies, milestones, baseline-vs-actual, critical path.',
  tools: ['apexgantt_generate_config', 'apexgantt_validate_config', 'apexgantt_get_reference'],
  docs: 'https://apexcharts.com/docs/apexgantt/',
};

export function registerTools(server: McpServer): void {
  registerGanttTools(server);
}
