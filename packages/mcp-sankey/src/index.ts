import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerSankeyTools } from './register.js';

export const id = 'sankey' as const;

export const metadata: ProductMetadata = {
  name: 'ApexSankey',
  useFor:
    'Flow diagrams: multi-stage allocation, energy/budget/traffic flows, conversion funnels. Layered DAG — no cycles, no self-loops.',
  tools: ['apexsankey_generate_config', 'apexsankey_validate_config', 'apexsankey_get_reference'],
  docs: 'https://apexcharts.com/docs/apexsankey/',
};

export function registerTools(server: McpServer): void {
  registerSankeyTools(server);
}

export { readCompatibility } from './skill.js';
