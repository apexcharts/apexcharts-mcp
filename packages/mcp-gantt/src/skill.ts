import {
  createReferenceReader,
  readSkillCompatibility,
  type ReferenceEntry,
  type SkillCompatibility,
} from '@apexcharts-mcp/core';
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
    file: 'editing.md',
    description:
      'Editing (3.12.0+): the CRUD API (addTask / updateTask / removeTask and friends) with its container events and synchronous veto hooks, undo/redo via `history`, the user-facing interaction toggles, the working `calendar`, and sub-day scheduling through `snapUnit` / `snapValue`. Every mutating call is recorded in the undo history.',
  },
  {
    file: 'grid.md',
    description:
      'Turning the task list into a real data grid (3.13.0 wave, shipped in 3.14.0): hierarchy-preserving sorting, the quick filter and advanced filter builder plus their runtime API, grouping, and column auto-size / resize / reorder. All of it is view-only and never mutates the task tree, WBS codes, or task data.',
  },
  {
    file: 'interaction.md',
    description:
      'Opt-in interaction features (3.13.0 wave and 3.15.0): UI-state persistence as a versioned, SSR-safe `GanttUiState` snapshot (zoom, scroll, collapse, selection, sort, filter, column widths and order), draw-to-create via `enableDrawTask`, scroll-to-task, and SVG / PNG / PDF export. All additive; existing charts are unaffected unless enabled.',
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

export function readCompatibility(): Promise<SkillCompatibility> {
  return readSkillCompatibility(skill);
}
