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
      'Top-level skill index (targets ApexCharts v8): critical rules, the series data format table for all 30 chart types, formatter signatures, pitfalls, the feature-platform map with its bundle tiers, and an API methods reference. Read this first. Leads with the v8.0 breaking change (unit/waffle, sunburst, violin, drilldown, waterfall, dumbbell and streamgraph left the default bundle and need their own import) and the new full bundle, apexcharts/full, that carries every chart type and feature.',
  },
  {
    file: 'cartesian-charts.md',
    description:
      'Line, area, scatter, bubble, rangeArea, and the v7.1 streamgraph (baseline offset, band order, in-band labels; Tier 2 since v8.0, so it needs apexcharts/features/streamgraph): data formats, axis options, per-type pitfalls, and the v7 axis/layout fixes.',
  },
  {
    file: 'bar-charts.md',
    description:
      "Bar, column (chart.type 'column' is a synonym for 'bar' since v7.9), rangeBar, timeline/Gantt, the v6 funnel + pyramid aliases, and the v7.1 waterfall (signed deltas, isSubtotal/isTotal) + dumbbell (one series per measure), both Tier 2 since v8.0 (each needs its apexcharts/features/* import): plotOptions.bar, horizontal vs vertical, stacking, and borderRadiusWhenStacked (dropped in v7.0, working again since v7.4).",
  },
  {
    file: 'financial-charts.md',
    description:
      'Candlestick (OHLC), box plot (5-number summary or raw samples), the v6 violin (density profile or raw samples; Tier 2 since v8.0, import apexcharts/violin), the v6.9 histogram (raw observations, binning rules), and the v7.1 raincloud (raw sample, a premium Tier 2 preset over the violin engine; apexcharts/raincloud also brings violin, which the default bundle lacks since v8.0): data formats, plotOptions for colors, and time axis setup.',
  },
  {
    file: 'circular-charts.md',
    description:
      'Pie, donut, polar area, radial bar, the v6 gauge (arc/needle, bands, ticks), the v6.7 sunburst hierarchy, and the v6.6 unit/waffle charts (incl. v6.10 unit-shapes and the v7.0 pictogram glyphs), with sunburst and unit/waffle Tier 2 since v8.0 (import apexcharts/sunburst or apexcharts/unit): flat-array series format, labels, donut center customization, and the radialBar value domain (plotOptions.radialBar min/max, default 0-100).',
  },
  {
    file: 'grid-charts.md',
    description:
      'Heatmap, treemap and the v7.6 icicle: grid data format, color ranges, value scaling, the v7.2 heatmap cell shapes (hexagon honeycomb, circle, diamond), the v6.9 nested treemap (children to any depth), and the icicle partition layout (Tier 2: import apexcharts/icicle next to the default bundle; plotOptions.icicle, flame-graph direction).',
  },
  {
    file: 'radar-charts.md',
    description: 'Radar charts: categories per axis, scaling, and styling polygons.',
  },
  {
    file: 'feature-platform.md',
    description:
      'The opt-in feature platform and its v8 bundle tiers (what the default bundle carries, the add-on imports, and apexcharts/full): small multiples (Trellis), plugins (Weave), canvas renderer (Strata), custom series (Marks), undo/redo (Rewind), shareable views (Perspectives), themes/tokens (Facet), easing (Cadence), crossfilter (Link), annotation authoring (Ink), measure ruler, context menu, storyboard, the v7.9 highlight filter (highlightFilter), streaming, and drilldown (Tier 2 since v8.0), with config shapes, APIs, import paths, licensing, and the v7.0 and v8.0 breaking changes. Renamed from v6-features.md in skill 3.0.0.',
  },
  {
    file: 'tree-shaking.md',
    description:
      'Bundle tiers and optimization: what changed in v8.0, which chart types and features the default bundle carries (Tier 1) and which need their own import next to it (Tier 2), the apexcharts/full bundle that needs no add-on, per-type entry points, feature side-effect imports, the lean-core script-tag channel, and building up from the bare core.',
  },
  {
    file: 'ssr.md',
    description:
      'Server-side rendering with apexcharts/ssr: renderToString, renderToHTML, client-side hydration (hydrate() is only on apexcharts/ssr), and the Tier 2 imports a v8 server render needs.',
  },
  {
    file: 'framework-wrappers.md',
    description:
      'React, Vue 3, and Angular integration: props, lifecycle, avoiding double-render pitfalls, wrapper versions for apexcharts 8, and importing Tier 2 chart types and features once per app.',
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
