import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { generateGanttConfig } from './generateConfig.js';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';
import { validateGanttConfig } from './validateConfig.js';

export function registerGanttTools(server: McpServer): void {
  server.registerTool(
    'apexgantt_generate_config',
    {
      title: 'Generate ApexGantt config',
      description:
        'Build a minimal valid ApexGantt options object. Generates a placeholder ' +
        'schedule (phases, dependencies, a milestone) when `tasks` is omitted, so ' +
        'the result can be rendered as-is. The placeholder dates are emitted in ' +
        'whatever `inputDateFormat` is chosen, so they parse without further work.',
      inputSchema: {
        tasks: z
          .array(z.unknown())
          .optional()
          .describe(
            'Task array (`series`). Each task: { id, name, startTime, endTime?, progress?, type?, parentId?, dependency? }.',
          ),
        title: z.string().optional().describe('Optional chart title.'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Chart height in px (default 600).'),
        inputDateFormat: z
          .string()
          .optional()
          .describe(
            'dayjs format for parsing date strings. Default is ApexGantt\'s own default "MM-DD-YYYY". Common alternatives: "YYYY-MM-DD", "DD/MM/YYYY".',
          ),
        enableCriticalPath: z
          .boolean()
          .optional()
          .describe('Highlight the longest dependency chain on render.'),
        baseline: z
          .union([z.boolean(), z.object({ color: z.string().optional() }).passthrough()])
          .optional()
          .describe('Enable planned-vs-actual baseline track. Tasks must supply a per-task `baseline: { start, end }`.'),
        enableSelection: z
          .boolean()
          .optional()
          .describe('Enable `getSelectedTasks()` / `setSelectedTasks()` / `selectionChange` event.'),
      },
    },
    async (input) => {
      const config = generateGanttConfig(input as Parameters<typeof generateGanttConfig>[0]);
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexgantt_validate_config',
    {
      title: 'Validate ApexGantt config',
      description:
        'Check an ApexGantt options object against the rules in apexgantt-skill ' +
        '(missing id/name/startTime, duplicate ids, orphan parentId, milestone with ' +
        'endTime, progress out of 0–100, ISO dates with default MM-DD-YYYY format, ' +
        'dependency object using `id` instead of `taskId`, unknown dependency target, ' +
        'self-dependency, invalid dependency type, cycles, baseline missing start/end). ' +
        'Returns structured issues with stable rule ids.',
      inputSchema: {
        config: z.unknown().describe('The ApexGantt options object to validate.'),
      },
    },
    async ({ config }) => {
      const result = validateGanttConfig(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

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
