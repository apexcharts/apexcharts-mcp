import { createReferenceReader, type ReferenceEntry } from '@apexcharts-mcp/core';
import * as skill from 'apexsankey-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level ApexSankey skill index: { nodes, edges, options } data shape, layer ordering, edge gradients, and framework integration. Read this first.',
  },
  {
    file: 'data-format.md',
    description: 'Nodes and edges shape, identifiers, values, and layer assignment.',
  },
  {
    file: 'styling-and-interaction.md',
    description: 'Edge gradients, node colors, path highlighting, custom tooltips, and license/watermark.',
  },
  {
    file: 'framework-wrappers.md',
    description: 'React, Vue 3, and Angular integration for ApexSankey.',
  },
];

const reader = createReferenceReader(REFERENCE_INDEX, skill);

export function isKnownReference(file: string): boolean {
  return reader.isKnown(file);
}

export async function readKnownFile(file: string): Promise<string> {
  return reader.read(file);
}
