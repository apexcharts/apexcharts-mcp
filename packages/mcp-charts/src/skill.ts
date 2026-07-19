/**
 * Resolver for the ApexCharts skill knowledge base.
 *
 * The reference markdown is shipped via the `apexcharts-skill` npm package,
 * not bundled in this repo. The shared core reader handles SKILL.md vs
 * reference-file routing.
 */
import {
  createReferenceReader,
  readSkillCompatibility,
  type ReferenceEntry,
  type SkillCompatibility,
} from '@apexcharts-mcp/core';
import * as skill from 'apexcharts-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level skill index (targets ApexCharts v6): critical rules, the series data format table for all 20 chart types, formatter signatures, pitfalls, the v6 feature-platform map, and an API methods reference. Read this first.',
  },
  {
    file: 'cartesian-charts.md',
    description:
      'Line, area, scatter, bubble, and rangeArea — data formats, axis options, and per-type pitfalls.',
  },
  {
    file: 'bar-charts.md',
    description:
      'Bar, column, rangeBar, timeline/Gantt, and the v6 funnel + pyramid aliases: plotOptions.bar, horizontal vs vertical, stacking, timeline patterns, and funnel/pyramid shapes.',
  },
  {
    file: 'financial-charts.md',
    description:
      'Candlestick (OHLC), box plot (5-number summary), and the v6 violin (density profile): data formats, plotOptions for colors, and time axis setup.',
  },
  {
    file: 'circular-charts.md',
    description:
      'Pie, donut, polar area, radial bar, and the v6 gauge (arc/needle, bands, ticks): flat-array series format, labels, donut center customization, and the 0-100 radialBar rule.',
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
    file: 'v6-features.md',
    description:
      'The v6 opt-in feature platform: plugins (Weave), canvas renderer (Strata), custom series (Marks), undo/redo (Rewind), shareable views (Perspectives), themes/tokens (Facet), easing (Cadence), crossfilter (Link), annotation authoring (Ink), measure ruler, context menu, storyboard, streaming, and drilldown, with config shapes, APIs, and tree-shaking import paths.',
  },
  {
    file: 'tree-shaking.md',
    description:
      'Bundle optimization: per-type entry points, feature side-effect imports (including all v6 features), and how to register types/features manually.',
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

export function readCompatibility(): Promise<SkillCompatibility> {
  return readSkillCompatibility(skill);
}
