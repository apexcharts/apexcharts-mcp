import { createReferenceReader, type ReferenceEntry } from '@apexcharts-mcp/core';
import * as skill from 'apextree-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level ApexTree skill index: NestedNode data shape, grow directions, nodeTemplate, and framework integration. Read this first.',
  },
  {
    file: 'data-format.md',
    description:
      'Recursive NestedNode shape, content keys, and how `data` drives org-card layouts.',
  },
  {
    file: 'graph-api.md',
    description:
      'Imperative API: search, breadcrumb, selection, expand/collapse, and lifecycle methods.',
  },
  {
    file: 'framework-wrappers.md',
    description: 'React, Vue 3, and Angular integration for ApexTree.',
  },
];

const reader = createReferenceReader(REFERENCE_INDEX, skill);

export function isKnownReference(file: string): boolean {
  return reader.isKnown(file);
}

export async function readKnownFile(file: string): Promise<string> {
  return reader.read(file);
}
