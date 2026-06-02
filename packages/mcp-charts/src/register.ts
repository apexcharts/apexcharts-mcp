import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { CHART_CATALOG, SUPPORTED_CHART_TYPES, type ChartFamily } from './chartCatalog.js';
import { generateChartConfig } from './generateConfig.js';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';
import { validateChartConfig } from './validateConfig.js';

const CHART_FAMILIES: ChartFamily[] = [
  'cartesian',
  'bar',
  'financial',
  'circular',
  'grid',
  'radar',
];

export function registerChartsTools(server: McpServer): void {
  server.registerTool(
    'apexcharts_generate_config',
    {
      title: 'Generate ApexCharts config',
      description:
        'Build a minimal valid ApexCharts options object for a given chart type. ' +
        'Picks the correct series data format (axis vs non-axis) and supplies ' +
        'placeholder data when none is given. Use this as the starting point for a chart.',
      inputSchema: {
        type: z
          .enum(SUPPORTED_CHART_TYPES as [string, ...string[]])
          .describe('ApexCharts chart.type value (e.g. "line", "bar", "pie").'),
        series: z
          .unknown()
          .optional()
          .describe('Optional series data in the format required by the chart type.'),
        categories: z
          .array(z.string())
          .optional()
          .describe('xaxis categories (axis charts) or labels (pie/donut/etc).'),
        title: z.string().optional().describe('Optional chart title.'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Chart height in px (default 350).'),
        stacked: z
          .boolean()
          .optional()
          .describe('Stack series. Honored only for bar and area chart types.'),
        horizontal: z
          .boolean()
          .optional()
          .describe('Render bars horizontally. Honored only for bar chart type.'),
      },
    },
    async (input) => {
      const config = generateChartConfig(input as Parameters<typeof generateChartConfig>[0]);
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexcharts_validate_config',
    {
      title: 'Validate ApexCharts config',
      description:
        'Check an ApexCharts options object against the data-format rules and known ' +
        'pitfalls (wrong series shape for chart type, radialBar values out of 0–100 range, ' +
        'undefined data points, conflicting tooltip flags, hex colors missing #, etc.). ' +
        'Returns structured issues so the caller can fix them. Returns ok: true when there ' +
        'are no errors (warnings still allowed).',
      inputSchema: {
        config: z.unknown().describe('The ApexCharts options object to validate.'),
      },
    },
    async ({ config }) => {
      const result = validateChartConfig(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexcharts_list_types',
    {
      title: 'List supported chart types',
      description:
        'Return every ApexCharts chart type this server supports, with name, description, ' +
        'family (cartesian/bar/financial/circular/grid/radar), series format (axis vs non-axis), ' +
        'expected data shape, and the reference doc filename for deeper detail. ' +
        'Optionally filter by family.',
      inputSchema: {
        family: z
          .enum(CHART_FAMILIES as [ChartFamily, ...ChartFamily[]])
          .optional()
          .describe('Optional family filter. Omit to return all supported types.'),
      },
    },
    async ({ family }) => {
      const types = family ? CHART_CATALOG.filter((c) => c.family === family) : CHART_CATALOG;
      const payload = {
        count: types.length,
        types: types.map((c) => ({
          type: c.type,
          name: c.name,
          description: c.description,
          family: c.family,
          seriesFormat: c.seriesFormat,
          dataFormat: c.dataFormat,
          referenceFile: c.referenceFile,
        })),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexcharts_get_reference',
    {
      title: 'Get ApexCharts reference doc',
      description:
        'Read authoritative ApexCharts documentation from the bundled apexcharts-skill ' +
        'knowledge base. Call with no arguments to list all available files (SKILL.md plus ' +
        'per-family reference docs). Call with `file` to return that file as markdown. Use ' +
        'this when you need to look up an option, formatter signature, plotOptions detail, ' +
        'or a fully worked example for a specific chart family.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe(
            'Filename to read (e.g. "SKILL.md", "circular-charts.md"). Omit to list available files.',
          ),
      },
    },
    async ({ file }) => {
      if (!file) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: REFERENCE_INDEX.length, files: REFERENCE_INDEX }, null, 2),
            },
          ],
        };
      }

      if (!isKnownReference(file)) {
        const known = REFERENCE_INDEX.map((e) => e.file).join(', ');
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Unknown reference file "${file}". Available: ${known}.`,
            },
          ],
        };
      }

      const text = await readKnownFile(file);
      return { content: [{ type: 'text', text }] };
    },
  );
}
