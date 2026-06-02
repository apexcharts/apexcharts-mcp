import { createReferenceReader, type ReferenceEntry } from '@apexcharts-mcp/core';
import * as skill from 'apexgantt-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level ApexGantt skill index: task data format, dependency types (FS/SS/FF/SF), view modes, update lifecycle, and framework integration. Read this first.',
  },
  {
    file: 'data-format.md',
    description:
      'Task data shape: id, start/end, progress, dependencies, custom fields, and date parsing rules.',
  },
  {
    file: 'dependencies.md',
    description:
      'Linking tasks with FS/SS/FF/SF dependency types, critical-path computation, and baseline-vs-actual rendering.',
  },
  {
    file: 'columns-and-toolbar.md',
    description: 'Left-pane column configuration, custom toolbar items, and selection behavior.',
  },
  {
    file: 'events.md',
    description: 'Lifecycle events (taskClick, taskDrag, viewChange, etc.) and how to wire them up.',
  },
  {
    file: 'framework-wrappers.md',
    description: 'React, Vue 3, and Angular integration — props, refs, and update patterns.',
  },
];

const reader = createReferenceReader(REFERENCE_INDEX, skill);

export function isKnownReference(file: string): boolean {
  return reader.isKnown(file);
}

export async function readKnownFile(file: string): Promise<string> {
  return reader.read(file);
}
