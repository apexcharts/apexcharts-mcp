import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';

export function registerGanttTools(server: McpServer): void {
  server.registerTool(
    'apexgantt_get_reference',
    {
      title: 'Get ApexGantt reference doc',
      description:
        'Read authoritative ApexGantt documentation from the bundled apexgantt-skill ' +
        'knowledge base. Call with no arguments to list all available files. Call with ' +
        '`file` to return that file as markdown. Use this to look up task data format, ' +
        'dependency types, view modes, the update lifecycle, or framework integration.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe(
            'Filename to read (e.g. "SKILL.md", "data-format.md"). Omit to list available files.',
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
