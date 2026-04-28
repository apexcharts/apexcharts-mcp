/**
 * Resolver for the ApexCharts skill knowledge base.
 *
 * The reference markdown is shipped via the `apexcharts-skill` npm package,
 * not bundled in this repo. Use the helpers below to read its contents at
 * runtime.
 */
import { readFile } from 'node:fs/promises';
import {
  referencePath,
  referencesDir,
  skillFile,
} from 'apexcharts-skill';

export { referencesDir, skillFile, referencePath };

export interface ReferenceEntry {
  /** Filename used to request this doc (e.g. "SKILL.md", "circular-charts.md"). */
  file: string;
  /** Short, one-line summary of what's inside. */
  description: string;
}

/**
 * Files exposed via the get_reference tool, in the order we want callers to
 * see them (SKILL.md first, then reference docs, then framework/SSR/build
 * topics last).
 */
export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level skill index: critical rules, the series data format table for all 16 chart types, formatter signatures, 16 pitfalls, and an API methods reference. Read this first.',
  },
  {
    file: 'cartesian-charts.md',
    description: 'Line, area, scatter, bubble, and rangeArea — data formats, axis options, and per-type pitfalls.',
  },
  {
    file: 'bar-charts.md',
    description: 'Bar, column, rangeBar, and timeline/Gantt — plotOptions.bar, horizontal vs vertical, stacking, and timeline patterns.',
  },
  {
    file: 'financial-charts.md',
    description: 'Candlestick (OHLC) and box plot (5-number summary) — data formats, plotOptions for colors, and time axis setup.',
  },
  {
    file: 'circular-charts.md',
    description: 'Pie, donut, polar area, and radial bar — flat-array series format, labels, donut center customization, and the 0–100 radialBar rule.',
  },
  {
    file: 'grid-charts.md',
    description: 'Heatmap and treemap — grid data format, color ranges, and value scaling.',
  },
  {
    file: 'radar-charts.md',
    description: 'Radar charts — categories per axis, scaling, and styling polygons.',
  },
  {
    file: 'tree-shaking.md',
    description: 'Bundle optimization: per-type entry points, feature side-effect imports, and how to register types/features manually.',
  },
  {
    file: 'ssr.md',
    description: 'Server-side rendering with apexcharts/ssr: renderToString, renderToHTML, and client-side hydration.',
  },
  {
    file: 'framework-wrappers.md',
    description: 'React, Vue 3, and Angular integration — props, lifecycle, and avoiding double-render pitfalls.',
  },
];

const REFERENCE_FILES = new Set(REFERENCE_INDEX.map((e) => e.file));

/** True if `file` is a known reference doc that get_reference can return. */
export function isKnownReference(file: string): boolean {
  return REFERENCE_FILES.has(file);
}

/** Read SKILL.md as a UTF-8 string. */
export async function readSkill(): Promise<string> {
  return readFile(skillFile, 'utf8');
}

/** Read a reference doc (e.g. "circular-charts.md") as a UTF-8 string. */
export async function readReference(filename: string): Promise<string> {
  return readFile(referencePath(filename), 'utf8');
}

/**
 * Read any file in the reference index, including SKILL.md. Throws if the
 * filename isn't in the known list — never reads arbitrary paths.
 */
export async function readKnownFile(file: string): Promise<string> {
  if (!isKnownReference(file)) {
    throw new Error(
      `Unknown reference file "${file}". Use get_reference with no arguments to list available files.`,
    );
  }
  if (file === 'SKILL.md') return readSkill();
  return readReference(file);
}
