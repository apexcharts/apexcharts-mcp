import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { generateSankeyConfig } from './generateConfig.js';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';
import { validateSankeyConfig } from './validateConfig.js';

export function registerSankeyTools(server: McpServer): void {
  server.registerTool(
    'apexsankey_generate_config',
    {
      title: 'Generate ApexSankey config',
      description:
        'Build a minimal valid ApexSankey config split into `options` (constructor) ' +
        'and `data` (render payload). Generates a 5-node placeholder flow when nodes/edges ' +
        'are omitted so the result renders something visible. Use the result by calling ' +
        '`new ApexSankey(el, options)` then `sankey.render(data)`.',
      inputSchema: {
        nodes: z
          .array(z.unknown())
          .optional()
          .describe('Array of node objects: `{ id, title, color? }`. ids must be unique.'),
        edges: z
          .array(z.unknown())
          .optional()
          .describe(
            'Array of edge objects: `{ source, target, value, type }`. source/target reference node ids; value > 0.',
          ),
        width: z
          .union([z.number(), z.string()])
          .optional()
          .describe('Canvas width (px number or any CSS width). Default "100%".'),
        height: z
          .union([z.number(), z.string()])
          .optional()
          .describe('Canvas height (px number or "auto"). Default "auto" ≈ 1.6:1 from width.'),
        spacing: z.number().optional().describe('Horizontal gap between node columns (px). Default 20.'),
        nodeWidth: z.number().optional().describe('Node rectangle width (px). Default 20.'),
        animation: z.boolean().optional().describe('Enable entrance animation. Default true.'),
        tooltipTheme: z.enum(['light', 'dark']).optional().describe('Tooltip preset.'),
      },
    },
    async (input) => {
      const config = generateSankeyConfig(input as Parameters<typeof generateSankeyConfig>[0]);
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexsankey_validate_config',
    {
      title: 'Validate ApexSankey config',
      description:
        'Check an ApexSankey config against apexsankey-skill rules (unique node ids, ' +
        'edges reference real nodes, edge.value > 0, no self-loops, DAG / no cycles, ' +
        'edge.type provided for grouping). Accepts either the wrapped `{ options, data }` ' +
        'shape from generate_config or the raw render payload `{ nodes, edges }`.',
      inputSchema: {
        config: z.unknown().describe('The ApexSankey config object to validate.'),
      },
    },
    async ({ config }) => {
      const result = validateSankeyConfig(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexsankey_get_reference',
    {
      title: 'Get ApexSankey reference doc',
      description:
        'Read authoritative ApexSankey documentation from the bundled apexsankey-skill ' +
        'knowledge base. Call with no arguments to list available files; call with `file` ' +
        'to fetch markdown. Use this for the { nodes, edges, options } data shape, ' +
        'layer ordering, styling, or framework integration.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe('Filename to read (e.g. "SKILL.md", "data-format.md"). Omit to list available files.'),
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
