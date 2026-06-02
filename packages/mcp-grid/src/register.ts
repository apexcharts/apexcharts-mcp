import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { generateGridConfig } from './generateConfig.js';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';
import { validateGridConfig } from './validateConfig.js';

export function registerGridTools(server: McpServer): void {
  server.registerTool(
    'apexgrid_generate_config',
    {
      title: 'Generate apex-grid config',
      description:
        'Build a minimal valid `<apex-grid>` config: `{ columns, data }`. When both ' +
        'are omitted, a small users table is generated. When only `columns` is omitted, ' +
        'they are inferred from the keys of the first data row with `type` inferred per ' +
        'column. Pass `enableSortAndFilter: true` to opt every generated column in.',
      inputSchema: {
        columns: z
          .array(z.unknown())
          .optional()
          .describe('Array of ColumnConfiguration. Each column needs `{ key, type? }` where key is a real key of each data row.'),
        data: z
          .array(z.unknown())
          .optional()
          .describe('Array of row objects. Keys referenced by `column.key` must exist on each row.'),
        enableSortAndFilter: z
          .boolean()
          .optional()
          .describe('Convenience: add `sort: true` and `filter: true` to every generated column.'),
        resizable: z
          .boolean()
          .optional()
          .describe('Convenience: add `resizable: true` to every generated column.'),
      },
    },
    async (input) => {
      const config = generateGridConfig(input as Parameters<typeof generateGridConfig>[0]);
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexgrid_validate_config',
    {
      title: 'Validate apex-grid config',
      description:
        'Check an apex-grid `{ columns, data }` config against apexgrid-skill rules: ' +
        'columns/data required and array-shaped, every column.key must be a real key of ' +
        'the data rows, column.key unique, type ∈ {string, number, boolean} (no "date" — ' +
        'common mistake), sort/filter is boolean or config object. Returns structured ' +
        'issues with stable rule ids.',
      inputSchema: {
        config: z.unknown().describe('The apex-grid config `{ columns, data }` to validate.'),
      },
    },
    async ({ config }) => {
      const result = validateGridConfig(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexgrid_get_reference',
    {
      title: 'Get apex-grid reference doc',
      description:
        'Read authoritative apex-grid documentation from the bundled apexgrid-skill ' +
        'knowledge base. Call with no arguments to list available files; call with `file` ' +
        'to fetch markdown. Use this for ColumnConfiguration, Lit cellTemplate, sort/filter, ' +
        'data pipeline, or framework integration.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe('Filename to read (e.g. "SKILL.md", "columns-and-templates.md"). Omit to list available files.'),
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
