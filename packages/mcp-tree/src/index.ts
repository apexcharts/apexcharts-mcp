import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerTreeTools } from './register.js';

export const id = 'tree' as const;

export const metadata: ProductMetadata = {
  name: 'ApexTree',
  useFor:
    'Hierarchies and tree diagrams: org charts, file/decision trees, family trees, directional layouts (top/bottom/left/right).',
  tools: ['apextree_generate_config', 'apextree_validate_config', 'apextree_get_reference'],
  docs: 'https://apexcharts.com/docs/apextree/',
};

export function registerTools(server: McpServer): void {
  registerTreeTools(server);
}
