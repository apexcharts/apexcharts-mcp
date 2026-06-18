import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerGridTools } from './register.js';

export const id = 'grid' as const;

export const metadata: ProductMetadata = {
  name: 'Apex Grid',
  useFor:
    'Sortable, filterable, virtualized data tables — the `<apex-grid>` Lit web component. Use for tabular data, not charts.',
  tools: ['apexgrid_generate_config', 'apexgrid_validate_config', 'apexgrid_get_reference'],
  docs: 'https://github.com/apexcharts/apexgrid',
};

export function registerTools(server: McpServer): void {
  registerGridTools(server);
}

export { readCompatibility } from './skill.js';
