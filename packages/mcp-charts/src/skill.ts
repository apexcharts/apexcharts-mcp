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
      'Top-level skill index (targets ApexCharts v7): critical rules, the series data format table for all 28 chart types, formatter signatures, pitfalls, the feature-platform map with its bundle tiers, and an API methods reference. Read this first. Leads with the v7.0 breaking change that nine features left the default bundle.',
  },
  {
    file: 'cartesian-charts.md',
    description:
      'Line, area, scatter, bubble, rangeArea, and the v7.1 streamgraph (baseline offset, band order, in-band labels): data formats, axis options, per-type pitfalls, and the v7 axis/layout fixes.',
  },
  {
    file: 'bar-charts.md',
    description:
      'Bar, column, rangeBar, timeline/Gantt, the v6 funnel + pyramid aliases, and the v7.1 waterfall (signed deltas, isSubtotal/isTotal) + dumbbell (one series per measure): plotOptions.bar, horizontal vs vertical, stacking, and the removal of borderRadiusWhenStacked in v7.0.',
  },
  {
    file: 'financial-charts.md',
    description:
      'Candlestick (OHLC), box plot (5-number summary or raw samples), the v6 violin (density profile or raw samples), the v6.9 histogram (raw observations, binning rules), and the v7.1 raincloud (raw sample, a premium Tier 2 preset over the violin engine): data formats, plotOptions for colors, and time axis setup.',
  },
  {
    file: 'circular-charts.md',
    description:
      'Pie, donut, polar area, radial bar, the v6 gauge (arc/needle, bands, ticks), the v6.7 sunburst hierarchy, and the v6.6 unit/waffle charts (incl. v6.10 unit-shapes and the v7.0 pictogram glyphs): flat-array series format, labels, donut center customization, and the 0-100 radialBar rule.',
  },
  {
    file: 'grid-charts.md',
    description:
      'Heatmap and treemap: grid data format, color ranges, value scaling, and the v6.9 nested treemap (children to any depth).',
  },
  {
    file: 'radar-charts.md',
    description: 'Radar charts — categories per axis, scaling, and styling polygons.',
  },
  {
    file: 'feature-platform.md',
    description:
      'The opt-in feature platform and its two v7 bundle tiers: small multiples (Trellis), plugins (Weave), canvas renderer (Strata), custom series (Marks), undo/redo (Rewind), shareable views (Perspectives), themes/tokens (Facet), easing (Cadence), crossfilter (Link), annotation authoring (Ink), measure ruler, context menu, storyboard, streaming, and drilldown, with config shapes, APIs, import paths, licensing, and the two v7.0 breaking changes. Renamed from v6-features.md in skill 3.0.0.',
  },
  {
    file: 'tree-shaking.md',
    description:
      'Bundle tiers and optimization: which features are in the default v7 bundle (Tier 1) and which need an explicit import whatever entry point you used (Tier 2), per-type entry points, feature side-effect imports, the lean-core script-tag channel, and how to register types/features manually.',
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
