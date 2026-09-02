/**
 * Catalog of supported ApexCharts chart types.
 *
 * Source of truth for tool metadata: list_chart_types reads `description` and
 * `dataFormat`; generate_chart_config uses `referenceFile` and `seedConfig` to
 * build a minimal valid options object for each type.
 */

export type ChartFamily =
  | 'cartesian'
  | 'bar'
  | 'financial'
  | 'circular'
  | 'grid'
  | 'radar'
  | 'unit';

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
    name: 'Bar / Column',
    description:
      'Bar chart. Use plotOptions.bar.horizontal to toggle between vertical (column) and horizontal bars.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [number] }]',
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
      'Waterfall chart (new in v7.1). The series carries signed DELTAS and the chart accumulates the running total for you; a row flagged isSubtotal or isTotal draws the running total from zero and omits y. Connectors bridge each bar to the next, and rising/falling/total bars take their own colors from plotOptions.waterfall.colors. Renders through the bar engine (apexcharts/waterfall entry); in the default bundle.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ name, data: [{ x, y }] }] where y is the signed delta, NOT a running total. A running-total row is { x, isSubtotal: true } or { x, isTotal: true } with no y.',
  },
  {
    type: 'dumbbell',
    name: 'Dumbbell',
    description:
      'Dumbbell chart (new in v7.1). Compares two or more measures per category, joined by a connector. One series per measure, all sharing the same x categories: do not zip values into [low, high] pairs (that is the older plotOptions.bar.isDumbbell range-bar form). Works horizontal (plotOptions.bar.horizontal) and as columns. Renders through the bar engine (apexcharts/dumbbell entry); in the default bundle.',
    family: 'bar',
    referenceFile: 'bar-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ name, data: [{ x, y }] }, ...]: ONE SERIES PER MEASURE, sharing x categories. Not [low, high] pairs.',
  },
  {
    type: 'streamgraph',
    name: 'Streamgraph',
    description:
      'Streamgraph (new in v7.1). Stacks the series as flowing bands around a baseline chosen for readability. The chart owns its stacking, baseline (plotOptions.streamgraph.offset) and band order (order), so do NOT set chart.stacked. Curves are monotoneCubic by default and each band is labelled inside itself. Renders through the rangeArea engine (apexcharts/streamgraph entry); in the default bundle.',
    family: 'cartesian',
    referenceFile: 'cartesian-charts.md',
    seriesFormat: 'axis',
    dataFormat: '[{ name, data: [{ x, y }] }]: same as area. Do not set chart.stacked.',
  },
  {
    type: 'raincloud',
    name: 'Raincloud',
    description:
      'Raincloud plot (new in v7.1, premium). Shows a distribution three ways at once: a half-violin for the shape, a box for the summary, and the observations themselves as "rain" underneath. A preset over the violin engine, so it is configured through plotOptions.violin (it presets side, box.show, box.whiskers and points.position). TIER 2: the only chart type absent from the default bundle, so it needs an explicit `import "apexcharts/raincloud"` even on the full bundle. Renders an APEXCHARTS watermark without a license.',
    family: 'financial',
    referenceFile: 'financial-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ name, data: [{ x, points: [number] }] }]: the raw sample per category; density, box and rain are derived.',
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
    description: 'Circular progress chart with one or more concentric tracks. Values are 0-100 (percentages).',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'non-axis',
    dataFormat: 'series: [number 0–100, ...] + labels: [string, ...]',
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
      'Hierarchical radial chart (new in v6.7). A nested pie/donut where rings go from the center hole outward, one per hierarchy level, each child arc nested inside its parent wedge. Free.',
    family: 'circular',
    referenceFile: 'circular-charts.md',
    seriesFormat: 'axis',
    dataFormat:
      '[{ data: [{ x, y, children?: [{ x, y, children? }] }] }] — a nested hierarchy; a leaf node carries its value in y, parent y can be omitted',
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
  },
];

export const SUPPORTED_CHART_TYPES = CHART_CATALOG.map((c) => c.type);

export function getChartInfo(type: string): ChartTypeInfo | undefined {
  return CHART_CATALOG.find((c) => c.type === type);
}
