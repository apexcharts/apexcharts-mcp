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
      'Top-level ApexGantt skill index: critical rules, task data format, dependency types (FS/SS/FF/SF; links never move tasks), continuous zoom via `pixelsPerDay`, the update() / updateTask() lifecycle, the public API (including the 3.20.0 getTask / getTasks / getDependencies / expandTask / collapseTask, and saving links alongside tasks), events, licensing (Premium and above, no free tier), and what changed in 3.20.0. Read this first.',
  },
  {
    file: 'data-format.md',
    description:
      'Task data shape: id, startTime/endTime, progress, milestones (explicit `type: "milestone"`; inferred from a missing endTime from 3.20.0), hierarchy and summary bars (parents with no or one date, parentId cycles), which rows `parsing` keeps, split segments, baseline, assignees, the `parsing` map, and date parsing rules (`inputDateFormat`, default MM-DD-YYYY).',
  },
  {
    file: 'dependencies.md',
    description:
      'Linking tasks with FS/SS/FF/SF dependency types (drawn and analysed, never moving tasks), lag (working days with a calendar; `lagUnit` has no effect), critical-path computation, drawing links with `dependencies.editable`, what `addDependency()` rejects (3.20.0 throws on self, cycle and summary-descendant links), and saving links with `getDependencies()`.',
  },
  {
    file: 'columns-and-toolbar.md',
    description:
      'Left-pane column configuration (default columns Task Name, Start, Duration, Progress), the 13 built-in column keys and cell renderers, custom toolbar items, and the `parsing` map.',
  },
  {
    file: 'events.md',
    description:
      'Container events (taskUpdate / taskUpdateSuccess with the 3.20.0 `source` field, taskDragged, taskResized, taskProgressChanged, selectionChange, dependency events), drag and resize, the edit dialog, selection, and saving edits to a backend with silent rollbacks.',
  },
  {
    file: 'editing.md',
    description:
      'Editing (3.12.0+): the CRUD API (addTask / updateTask / deleteTask / moveTask and the dependency methods; 3.20.0 adds getTask / getTasks / getDependencies / expandTask / collapseTask and `updateTask(id, patch, { silent })`), saving and reloading links, synchronous one-object veto hooks, undo/redo via `history`, the user-facing interaction toggles and keyboard editing, the working `calendar`, and sub-day scheduling through `snapUnit` / `snapValue`. Every mutating call is recorded in the undo history.',
  },
  {
    file: 'grid.md',
    description:
      'Turning the task list into a real data grid (3.13.0 wave, shipped in 3.14.0): hierarchy-preserving sorting, the quick filter and advanced filter builder plus their runtime API, grouping, and column auto-size / resize / reorder. All of it is view-only and never mutates the task tree, WBS codes, or task data.',
  },
  {
    file: 'interaction.md',
    description:
      'Opt-in interaction features (3.13.0 wave and 3.15.0): UI-state persistence as a versioned, SSR-safe `GanttUiState` snapshot (zoom, scroll, collapse, selection, sort, filter, column widths and order), draw-to-create via `enableDrawTask`, scroll-to-task (expands collapsed ancestors from 3.20.0, `{ expand: false }` to opt out), and SVG / PNG / PDF export. All additive; existing charts are unaffected unless enabled.',
  },
  {
    file: 'framework-wrappers.md',
    description:
      'React, Vue 3, and Angular wrappers (the `tasks` and `options` props, handlers that receive the event detail, refs and `getInstance()`, the license helper), and web components (shadow DOM).',
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
