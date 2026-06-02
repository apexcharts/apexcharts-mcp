import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { generateTreeConfig } from './generateConfig.js';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';
import { validateTreeConfig } from './validateConfig.js';

export function registerTreeTools(server: McpServer): void {
  server.registerTool(
    'apextree_generate_config',
    {
      title: 'Generate ApexTree config',
      description:
        'Build a minimal valid ApexTree config split into `options` (constructor) ' +
        'and `data` (the root NestedNode passed to `tree.render(data)`). Generates a ' +
        'small 3-level org chart placeholder when `data` is omitted. Every node in the ' +
        'output has `children: []` even for leaves (ApexTree requires it).',
      inputSchema: {
        data: z
          .unknown()
          .optional()
          .describe(
            'Root NestedNode: `{ id, name, children: [...] }`. Recursive. Leaves must have `children: []`.',
          ),
        width: z
          .union([z.number(), z.string()])
          .optional()
          .describe('Canvas width. Default "100%".'),
        height: z
          .union([z.number(), z.string()])
          .optional()
          .describe('Canvas height. Default "auto".'),
        direction: z
          .enum(['top', 'bottom', 'left', 'right'])
          .optional()
          .describe('Where the root sits and which way the tree grows. Default "top".'),
        contentKey: z
          .string()
          .optional()
          .describe(
            'Key on each node used as the label. Default "name". Set to "data" to activate the built-in org-card template.',
          ),
        enableSelection: z
          .union([z.literal('single'), z.literal('multi'), z.literal(false)])
          .optional()
          .describe('Selection mode. Note: enableSelection: true is INVALID — use "single" or "multi".'),
        theme: z.enum(['light', 'dark', 'custom']).optional(),
        edgeStyle: z.enum(['orthogonal', 'curved', 'straight']).optional(),
        siblingSpacing: z.number().optional().describe('Horizontal spacing between siblings (px).'),
        childrenSpacing: z.number().optional().describe('Vertical spacing between a node and its children (px).'),
        nodeWidth: z.number().optional(),
        nodeHeight: z.number().optional(),
        enableToolbar: z.boolean().optional(),
      },
    },
    async (input) => {
      const config = generateTreeConfig(input as Parameters<typeof generateTreeConfig>[0]);
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apextree_validate_config',
    {
      title: 'Validate ApexTree config',
      description:
        'Check an ApexTree config against apextree-skill rules: root is a NestedNode, ' +
        'every node has id/name/children (children must be `[]` for leaves), ids unique ' +
        'across the whole tree, valid direction/edgeStyle/edgeColorMode/theme values, ' +
        'enableSelection is "single"|"multi"|false (NOT boolean true), and a warning ' +
        'when contentKey is "data" but a node has no `data` payload. Accepts both the ' +
        'wrapped `{ options, data }` shape and a bare root node.',
      inputSchema: {
        config: z.unknown().describe('The ApexTree config to validate.'),
      },
    },
    async ({ config }) => {
      const result = validateTreeConfig(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apextree_get_reference',
    {
      title: 'Get ApexTree reference doc',
      description:
        'Read authoritative ApexTree documentation from the bundled apextree-skill ' +
        'knowledge base. Call with no arguments to list available files; call with `file` ' +
        'to fetch markdown. Use this for the NestedNode data shape, grow directions, ' +
        'nodeTemplate, the graph API, or framework integration.',
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
