import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ProductMetadata } from '@apexcharts-mcp/core';

import { registerChartsTools } from './register.js';

export const id = 'charts' as const;

export const metadata: ProductMetadata = {
  name: 'ApexCharts',
  useFor:
    'Every ApexCharts chart type: line, area, bar, column, scatter, bubble, rangeArea, rangeBar, pie, donut, polarArea, radialBar, gauge, radar, heatmap, treemap, candlestick, boxPlot, ' +
    'plus histogram, violin, raincloud, waterfall, dumbbell, streamgraph, funnel, pyramid, sunburst, icicle, unit and waffle.',
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
