import {
  createReferenceReader,
  readSkillCompatibility,
  type ReferenceEntry,
  type SkillCompatibility,
} from '@apexcharts-mcp/core';
import * as skill from 'apexgrid-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level apex-grid skill index: four-step setup, ColumnConfiguration shape, Lit cellTemplate, sort/filter API, and framework integration. Read this first.',
  },
  {
    file: 'columns-and-templates.md',
    description:
      'Generic ColumnConfiguration<T>, Lit cellTemplate / headerTemplate requirements, and per-column formatting.',
  },
  {
    file: 'data-pipeline.md',
    description:
      'How data flows through the grid: row updates, server-side data, and reactive Lit rendering.',
  },
  {
    file: 'sort-and-filter.md',
    description: 'Programmatic and UI-driven sort/filter API and event semantics.',
  },
  {
    file: 'framework-integration.md',
    description: 'Using <apex-grid> inside React, Vue, and Angular projects.',
  },
  {
    file: 'state-and-features.md',
    description:
      'Interaction features layered on the 3.0 API (apex-grid 3.1 to 3.4), all opt-in via a config object and off by default: row pinning into sticky top/bottom bands (identity is by reference), row reordering by drag / keyboard / API, inline-edit undo/redo, declarative column validators, spanning column groups, state and schema persist/restore, programmatic pagination / quick-filter / column pinning, `localeText` localization, the column menu and separator, and export sources and formats.',
  },
  {
    file: 'vanilla-js.md',
    description: 'Plain HTML + JS usage: install, register, theme CSS, host sizing.',
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
