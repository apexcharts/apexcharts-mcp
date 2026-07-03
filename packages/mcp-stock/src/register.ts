import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { generateStockConfig } from './generateConfig.js';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';
import { validateStockConfig } from './validateConfig.js';

export function registerStockTools(server: McpServer): void {
  server.registerTool(
    'apexstock_generate_config',
    {
      title: 'Generate ApexStock config',
      description:
        'Build a minimal valid ApexStock options object for a financial / stock ' +
        'chart. Generates a placeholder OHLCV candle series when `data` is omitted, ' +
        'so the result renders as-is. Note: at runtime ApexStock also requires ' +
        '`window.ApexCharts` to be set (it does not import ApexCharts) — that is a ' +
        'host-page concern, not part of this options object.',
      inputSchema: {
        data: z
          .array(z.unknown())
          .optional()
          .describe(
            'OHLC candles for series[0].data. Each point: { x, y: [open, high, low, close], v? }. Omit for a placeholder series.',
          ),
        name: z.string().optional().describe('Series name (default "Price").'),
        title: z.string().optional().describe('Optional chart title.'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Chart height in px (default 600).'),
        theme: z.enum(['light', 'dark']).optional().describe('Theme mode (default "light").'),
        indicators: z
          .union([z.array(z.string()), z.record(z.string(), z.unknown())])
          .optional()
          .describe(
            'Indicators to enable: a list of keys (e.g. ["moving average", "rsi"]) or a keyed config map (e.g. { "bollinger bands": { period: 20, stdDev: 2 } }). Overlays stack; only one oscillator is active at a time.',
          ),
      },
    },
    async (input) => {
      const config = generateStockConfig(input as Parameters<typeof generateStockConfig>[0]);
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexstock_validate_config',
    {
      title: 'Validate ApexStock config',
      description:
        'Check an ApexStock options object against the rules in apexstock-skill ' +
        '(missing series/data, flat o/h/l/c keys instead of a y:[o,h,l,c] array, ' +
        'malformed or inconsistent OHLC tuples, missing/invalid x, non-ascending ' +
        'data, invalid theme.mode, unknown indicator keys, and more than one ' +
        'oscillator enabled at once). Returns structured issues with stable rule ids.',
      inputSchema: {
        config: z.unknown().describe('The ApexStock options object to validate.'),
      },
    },
    async ({ config }) => {
      const result = validateStockConfig(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexstock_get_reference',
    {
      title: 'Get ApexStock reference doc',
      description:
        'Read authoritative ApexStock documentation from the bundled apexstock-skill ' +
        'knowledge base. Call with no arguments to list all available files. Call with ' +
        '`file` to return that file as markdown. Use this to look up the OHLC data ' +
        'format, indicators, streaming/appendData, trading overlays, theming, or ' +
        'framework integration.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe(
            'Filename to read (e.g. "SKILL.md", "indicators.md"). Omit to list available files.',
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
          content: [{ type: 'text', text: `Unknown reference file "${file}". Available: ${known}.` }],
        };
      }

      const text = await readKnownFile(file);
      return { content: [{ type: 'text', text }] };
    },
  );
}
