import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerMapsTools } from './register.js';

export const id = 'maps' as const;

export const metadata: ProductMetadata = {
  name: 'ApexMaps',
  useFor:
    'Geographic visualization: choropleth maps, proportional-symbol bubbles, point markers, ' +
    'origin-destination arcs, routes. Built-in world / US / EU geometry packs, no GeoJSON hunting.',
  tools: ['apexmaps_generate_config', 'apexmaps_validate_config', 'apexmaps_get_reference'],
  docs: 'https://apexcharts.com/docs/apexmaps/',
};

export function registerTools(server: McpServer): void {
  registerMapsTools(server);
}

export { readCompatibility } from './skill.js';
