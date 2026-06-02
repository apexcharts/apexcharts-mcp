/**
 * Resolver for the ApexCharts skill knowledge base.
 *
 * The reference markdown is shipped via the `apexcharts-skill` npm package,
 * not bundled in this repo. The shared core reader handles SKILL.md vs
 * reference-file routing.
 */
import { createReferenceReader, type ReferenceEntry } from '@apexcharts-mcp/core';
import * as skill from 'apexcharts-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level skill index: critical rules, the series data format table for all 16 chart types, formatter signatures, 16 pitfalls, and an API methods reference. Read this first.',
  },
  {
    file: 'cartesian-charts.md',
    description:
      'Line, area, scatter, bubble, and rangeArea — data formats, axis options, and per-type pitfalls.',
  },
  {
    file: 'bar-charts.md',
    description:
      'Bar, column, rangeBar, and timeline/Gantt — plotOptions.bar, horizontal vs vertical, stacking, and timeline patterns.',
  },
  {
    file: 'financial-charts.md',
    description:
      'Candlestick (OHLC) and box plot (5-number summary) — data formats, plotOptions for colors, and time axis setup.',
  },
  {
    file: 'circular-charts.md',
    description:
      'Pie, donut, polar area, and radial bar — flat-array series format, labels, donut center customization, and the 0–100 radialBar rule.',
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
    description:
      'Bundle optimization: per-type entry points, feature side-effect imports, and how to register types/features manually.',
  },
  {
    file: 'ssr.md',
    description:
      'Server-side rendering with apexcharts/ssr: renderToString, renderToHTML, and client-side hydration.',
  },
  {
    file: 'framework-wrappers.md',
    description:
      'React, Vue 3, and Angular integration — props, lifecycle, and avoiding double-render pitfalls.',
  },
];

const reader = createReferenceReader(REFERENCE_INDEX, skill);

export function isKnownReference(file: string): boolean {
  return reader.isKnown(file);
}

export async function readKnownFile(file: string): Promise<string> {
  return reader.read(file);
}

export async function readSkill(): Promise<string> {
  return reader.read('SKILL.md');
}

export async function readReference(filename: string): Promise<string> {
  return reader.read(filename);
}
