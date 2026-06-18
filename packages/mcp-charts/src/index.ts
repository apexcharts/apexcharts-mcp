import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerChartsTools } from './register.js';

export const id = 'charts' as const;

export const metadata: ProductMetadata = {
  name: 'ApexCharts',
  useFor:
    'Standard chart types: line, bar, area, pie, donut, scatter, bubble, heatmap, candlestick, boxPlot, radar, radialBar, rangeArea, rangeBar, treemap, polarArea.',
  tools: [
    'apexcharts_generate_config',
    'apexcharts_validate_config',
    'apexcharts_list_types',
    'apexcharts_get_reference',
  ],
  docs: 'https://apexcharts.com/docs/',
};

export function registerTools(server: McpServer): void {
  registerChartsTools(server);
}

export { readCompatibility } from './skill.js';
