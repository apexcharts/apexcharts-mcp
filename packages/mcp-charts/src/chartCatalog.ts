/**
 * Catalog of supported ApexCharts chart types.
 *
 * Source of truth for tool metadata: list_chart_types reads `description` and
 * `dataFormat`; generate_chart_config uses `referenceFile` and `seedConfig` to
 * build a minimal valid options object for each type. `bundle` is the one
 * place that says which types need an import beyond the default bundle: the
 * list_types output, its description sentence and the validator's
 * tier2-chart-type warning are all generated from it.
 */

export type ChartFamily =
  | 'cartesian'
  | 'bar'
  | 'financial'
  | 'circular'
  | 'grid'
  | 'radar'
  | 'unit';

/**
 * What a Tier 2 chart type needs beyond the default bundle
 * (`import ApexCharts from 'apexcharts'`, or dist/apexcharts.min.js). The full
 * bundle (`apexcharts/full`, apexcharts.full.min.js) has every type, so it
 * needs none of this.
 *
 * Mirrors apexcharts v8.0.0 src/modules/settings/TypeAliases.js: a type whose
 * renderer is in RESERVED_TYPES, or one in TYPE_FEATURES whose feature is not
 * in src/features/all.js. tests/chartCatalog.test.ts pins the set to that tag.
 */
export interface BundleRequirement {
  tier: 2;
  /** Side-effect import to add next to the default bundle. */
  import: string;
  /** Script-tag files, in load order. */
  scripts: string[];
  /** The apexcharts release that left this type out of the default bundle. */
  since: string;
  /**
   * What the chart does on the default bundle without the import:
   * 'throws' = the renderer lookup throws, so render() rejects and the console
   * names the import (ChartFactory.getChartClass); 'draws-empty' = the plot
   * draws nothing and one console warning names the import
   * (Data.applySeriesTransform).
   */
  failure: 'throws' | 'draws-empty';
  /** One more sentence specific to this type. */
  note?: string;
}

export interface ChartTypeInfo {
  /** ApexCharts `chart.type` value. */
  type: string;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Family the type belongs to (drives the reference doc lookup). */
  family: ChartFamily;
  /** Reference markdown filename inside `references/`. */
  referenceFile: string;
  /** Whether series uses the axis (`{ name, data }`) or non-axis (flat number array) format. */
  seriesFormat: 'axis' | 'non-axis';
  /** Short note about the data format (used by list_chart_types). */
  dataFormat: string;
  /** Set for a Tier 2 type only; absent means the default bundle has it (Tier 1). */
  bundle?: BundleRequirement;
}

export const CHART_CATALOG: ChartTypeInfo[] = [
  {
    type: 'line',
    name: 'Line',
    description: 'Continuous line chart for trends over a category or time axis.',
    family: 'cartesian',
    referenceFile: 'cartesian-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number | null] }] or [{ name, data: [{ x, y }] }]',
  },
  {
    type: 'area',
    name: 'Area',
    description: 'Filled area chart, like line but with the area below the curve shaded.',
    family: 'cartesian',
    referenceFile: 'cartesian-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number | null] }] or [{ name, data: [{ x, y }] }]',
  },
  {
    type: 'bar',
    name: 'Bar',
    description:
      'Bar chart. Use plotOptions.bar.horizontal to toggle between vertical (column) and horizontal bars.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number] }]',
  },
  {
    type: 'column',
    name: 'Column',
    description:
      "A plain synonym for 'bar' on chart.type (since v7.9). The library rewrites it to 'bar' on the way in, so every plotOptions.bar option applies, and it draws vertical bars by default. Releases before 7.9 cannot render chart.type 'column'; series[].type 'column' in a mixed chart has always worked.",
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number] }] + xaxis: { categories: [...] } (same as bar)',
  },
  {
    type: 'scatter',
    name: 'Scatter',
    description: 'Scatter plot of independent x/y data points. Always use the XY object format.',
    family: 'cartesian',
    referenceFile: 'cartesian-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y }] }]',
  },
  {
    type: 'bubble',
    name: 'Bubble',
    description: 'Scatter plot where bubble size encodes a third dimension (z).',
    family: 'cartesian',
    referenceFile: 'cartesian-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y, z }] }] — z is required',
  },
  {
    type: 'rangeArea',
    name: 'Range Area',
    description: 'Area chart drawn between a low and high y value at each x (e.g. min/max bands).',
    family: 'cartesian',
    referenceFile: 'cartesian-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y: [low, high] }] }]',
  },
  {
    type: 'rangeBar',
    name: 'Range Bar / Timeline',
    description: 'Bar chart drawn between a start and end value. Used for timelines and Gantt charts.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y: [start, end] }] }]',
  },
  {
    type: 'funnel',
    name: 'Funnel',
    description:
      'First-class funnel chart (new in v6). A bar alias for stage-by-stage drop-off. Order values largest-to-smallest.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number] }] + xaxis: { categories: [...] } for stage labels',
  },
  {
    type: 'pyramid',
    name: 'Pyramid',
    description:
      'First-class pyramid chart (new in v6). A funnel with the wide base at the bottom. Order values smallest-to-largest.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number] }] + xaxis: { categories: [...] } for stage labels',
  },
  {
    type: 'waterfall',
    name: 'Waterfall',
    description:
      'Waterfall chart (new in v7.1). The series carries signed DELTAS and the chart accumulates the running total for you; a row flagged isSubtotal or isTotal draws the running total from zero and omits y. Connectors bridge each bar to the next, and rising/falling/total bars take their own colors from plotOptions.waterfall.colors. Renders through the bar engine.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ name, data: [{ x, y }] }] where y is the signed delta, NOT a running total. A running-total row is { x, isSubtotal: true } or { x, isTotal: true } with no y.',
    bundle: {
      tier: 2,
      import: 'apexcharts/features/waterfall',
      scripts: ['dist/features/waterfall.js'],
      since: '8.0.0',
      failure: 'draws-empty',
      note: "The default bundle already has its renderer, so add only the feature; on the lean core, 'apexcharts/waterfall' brings both.",
    },
  },
  {
    type: 'dumbbell',
    name: 'Dumbbell',
    description:
      'Dumbbell chart (new in v7.1). Compares two or more measures per category, joined by a connector. One series per measure, all sharing the same x categories: do not zip values into [low, high] pairs (that is the older plotOptions.bar.isDumbbell range-bar form). Works horizontal (plotOptions.bar.horizontal) and as columns. Renders through the bar engine.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ name, data: [{ x, y }] }, ...]: ONE SERIES PER MEASURE, sharing x categories. Not [low, high] pairs.',
    bundle: {
      tier: 2,
      import: 'apexcharts/features/dumbbell',
      scripts: ['dist/features/dumbbell.js'],
      since: '8.0.0',
      failure: 'draws-empty',
      note: "The default bundle already has its renderer, so add only the feature; on the lean core, 'apexcharts/dumbbell' brings both.",
    },
  },
  {
    type: 'streamgraph',
    name: 'Streamgraph',
    description:
      'Streamgraph (new in v7.1). Stacks the series as flowing bands around a baseline chosen for readability. The chart owns its stacking, baseline (plotOptions.streamgraph.offset) and band order (order), so do NOT set chart.stacked. Curves are monotoneCubic by default and each band is labelled inside itself. Renders through the rangeArea engine.',
    family: 'cartesian',
    referenceFile: 'cartesian-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y }] }]: same as area. Do not set chart.stacked.',
    bundle: {
      tier: 2,
      import: 'apexcharts/features/streamgraph',
      scripts: ['dist/features/streamgraph.js'],
      since: '8.0.0',
      failure: 'draws-empty',
      note: "The default bundle already has its renderer, so add only the feature; on the lean core, 'apexcharts/streamgraph' brings both.",
    },
  },
  {
    type: 'raincloud',
    name: 'Raincloud',
    description:
      'Raincloud plot (new in v7.1, premium). Shows a distribution three ways at once: a half-violin for the shape, a box for the summary, and the observations themselves as "rain" underneath. A preset over the violin engine, so it is configured through plotOptions.violin (it presets side, box.show, box.whiskers and points.position). Renders an APEXCHARTS watermark without a license.',
    family: 'financial',
    referenceFile: 'financial-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ name, data: [{ x, points: [number] }] }]: the raw sample per category; density, box and rain are derived.',
    bundle: {
      tier: 2,
      import: 'apexcharts/raincloud',
      scripts: ['dist/violin.js', 'dist/features/raincloud.js'],
      since: '7.1.0',
      failure: 'throws',
      note: "'apexcharts/raincloud' brings the violin renderer and the raincloud statistics together; since v8.0 the default bundle has neither, so 'apexcharts/features/raincloud' alone works only where violin is already registered.",
    },
  },
  {
    type: 'histogram',
    name: 'Histogram',
    description:
      'Histogram (new in v6.9). Series carries raw observations (one number per event); the chart bins and counts them. Binning is configured via plotOptions.histogram (bins rule or count, binWidth, range, normalize, cumulative, overlap). Requires the apexcharts/features/stats module in tree-shaken builds.',
    family: 'financial',
    referenceFile: 'financial-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number] }] — raw observations, not pre-aggregated counts',
  },
  {
    type: 'candlestick',
    name: 'Candlestick',
    description: 'Financial OHLC chart showing open/high/low/close per period.',
    family: 'financial',
    referenceFile: 'financial-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ data: [{ x, y: [open, high, low, close] }] }]',
  },
  {
    type: 'boxPlot',
    name: 'Box Plot',
    description: 'Statistical chart showing min, Q1, median, Q3, and max for each group.',
    family: 'financial',
    referenceFile: 'financial-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ data: [{ x, y: [min, Q1, median, Q3, max] }] }]',
  },
  {
    type: 'violin',
    name: 'Violin',
    description:
      'Statistical distribution chart (new in v6). Each category shows a density curve, optionally with the raw sample points as jitter.',
    family: 'financial',
    referenceFile: 'financial-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y: { density: [[value, weight], ...], points?: [number] } }] }]',
    bundle: {
      tier: 2,
      import: 'apexcharts/violin',
      scripts: ['dist/violin.js'],
      since: '8.0.0',
      failure: 'throws',
      note: "On the lean core (apexcharts/core), add 'apexcharts/bar' too.",
    },
  },
  {
    type: 'heatmap',
    name: 'Heatmap',
    description: 'Grid of colored cells where color intensity encodes a value.',
    family: 'grid',
    referenceFile: 'grid-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y: number }] }] — y is the intensity',
  },
  {
    type: 'treemap',
    name: 'Treemap',
    description: 'Hierarchical chart of nested rectangles whose area encodes value.',
    family: 'grid',
    referenceFile: 'grid-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ data: [{ x, y: number }] }] — y is the area/value',
  },
  {
    type: 'icicle',
    name: 'Icicle',
    description:
      "Hierarchical partition chart (new in v7.6): one band per depth level, each child sized inside its parent's extent. The sunburst's layout in cartesian coordinates, so labels stay horizontal and same-depth siblings line up across branches; plotOptions.icicle.direction 'up' is the flame-graph orientation. Not a premium type.",
    family: 'grid',
    referenceFile: 'grid-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ data: [{ x, y, children?: [{ x, y, children? }] }] }] — the same nested hierarchy a sunburst takes; a branch may omit y and be the sum of its children',
    bundle: {
      tier: 2,
      import: 'apexcharts/icicle',
      scripts: ['dist/icicle.js'],
      since: '7.6.0',
      failure: 'throws',
    },
  },
  {
    type: 'radar',
    name: 'Radar',
    description: 'Multivariate chart drawn on radial axes, one axis per category.',
    family: 'radar',
    referenceFile: 'radar-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number] }] + xaxis: { categories: [...] }',
  },
  {
    type: 'pie',
    name: 'Pie',
    description: 'Standard pie chart of proportional segments.',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number, ...] + labels: [string, ...]',
  },
  {
    type: 'donut',
    name: 'Donut',
    description: 'Pie chart with a hollow center, often used to display a total.',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number, ...] + labels: [string, ...]',
  },
  {
    type: 'polarArea',
    name: 'Polar Area',
    description: 'Radial chart where each segment has equal angle but varying radius.',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number, ...] + labels: [string, ...]',
  },
  {
    type: 'radialBar',
    name: 'Radial Bar',
    description:
      'Circular progress chart with one or more concentric tracks. Values are percentages (0-100) unless plotOptions.radialBar.min/max set another domain.',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number, ...] (0-100 by default) + labels: [string, ...]',
  },
  {
    type: 'gauge',
    name: 'Gauge',
    description:
      'First-class gauge chart (new in v6). A radialBar alias supporting arc/needle shapes, colored bands, ticks, and a custom min/max domain.',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number] (single value) + labels: [string]; domain set via plotOptions.radialBar.min/max',
  },
  {
    type: 'sunburst',
    name: 'Sunburst',
    description:
      'Hierarchical radial chart (new in v6.7). A nested pie/donut where rings go from the center hole outward, one per hierarchy level, each child arc nested inside its parent wedge. Not a premium type.',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ data: [{ x, y, children?: [{ x, y, children? }] }] }] — a nested hierarchy; a leaf node carries its value in y, parent y can be omitted',
    bundle: {
      tier: 2,
      import: 'apexcharts/sunburst',
      scripts: ['dist/sunburst.js'],
      since: '8.0.0',
      failure: 'throws',
    },
  },
  {
    type: 'unit',
    name: 'Unit',
    description:
      'Unit chart (new in v6.6, premium). One mark per unit of value (dot/pictogram) arranged in layouts such as grouped, packed, columns, grid, or scatter. Renders an APEXCHARTS watermark without a license.',
    family: 'unit',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number, ...] + labels: [string, ...]; layout via plotOptions.unit.layout',
    bundle: {
      tier: 2,
      import: 'apexcharts/unit',
      scripts: ['dist/unit.js'],
      since: '8.0.0',
      failure: 'throws',
      note: "'apexcharts/unit' registers the waffle alias too.",
    },
  },
  {
    type: 'waffle',
    name: 'Waffle',
    description:
      'Waffle chart (new in v6.6, premium). A unit-chart alias that presets the grid layout, a part-to-whole square grid of cells. Renders an APEXCHARTS watermark without a license.',
    family: 'unit',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number, ...] + labels: [string, ...]',
    bundle: {
      tier: 2,
      import: 'apexcharts/unit',
      scripts: ['dist/unit.js'],
      since: '8.0.0',
      failure: 'throws',
      note: 'There is no apexcharts/waffle entry: the unit entry registers waffle.',
    },
  },
];

export const SUPPORTED_CHART_TYPES = CHART_CATALOG.map((c) => c.type);

/** The Tier 2 types, in catalog order. */
export const TIER2_CHART_TYPES = CHART_CATALOG.filter((c) => c.bundle).map((c) => c.type);

export function getChartInfo(type: string): ChartTypeInfo | undefined {
  return CHART_CATALOG.find((c) => c.type === type);
}

/** "v8.0" from "8.0.0". */
function minorVersion(version: string): string {
  return `v${version.split('.').slice(0, 2).join('.')}`;
}

/** "v8.0" style label for the release that left a type out of the default bundle. */
export function bundleSince(b: BundleRequirement): string {
  return minorVersion(b.since);
}

/** What to add for a Tier 2 type or feature: its import, its script tags, or the full bundle. */
export function bundleRemedy(b: Pick<BundleRequirement, 'import' | 'scripts'>): string {
  const tags =
    b.scripts.length === 1
      ? `load ${b.scripts[0]} with a script tag`
      : `load ${b.scripts.join(' and then ')} with script tags`;
  return (
    `Add \`import '${b.import}'\` next to \`import ApexCharts from 'apexcharts'\`, ${tags}, ` +
    "or use the full bundle (`import ApexCharts from 'apexcharts/full'`, or apexcharts.full.min.js)."
  );
}

/** What a Tier 2 chart does on the default bundle without its import. */
export function bundleConsequence(b: BundleRequirement): string {
  return b.failure === 'throws'
    ? 'render() rejects and the console names the import'
    : 'the chart draws nothing and one console warning names the import';
}

/**
 * The description list_types returns: the catalog text, plus for a Tier 2 type
 * one sentence generated from `bundle`, so the two can never disagree.
 */
export function describeChartType(info: ChartTypeInfo): string {
  const b = info.bundle;
  if (!b) return info.description;
  return (
    `${info.description} Tier 2: not in the default bundle since ${bundleSince(b)}. ` +
    `${bundleRemedy(b)} Without it, ${bundleConsequence(b)}.` +
    (b.note ? ` ${b.note}` : '')
  );
}
