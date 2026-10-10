import { describe, expect, it } from 'vitest';
import {
  CHART_CATALOG,
  describeChartType,
  getChartInfo,
  SUPPORTED_CHART_TYPES,
  TIER2_CHART_TYPES,
} from '../src/chartCatalog.js';

/*
 * Checked-in copy of apexcharts at tag v8.0.0, the version apexcharts-skill
 * pins: src/modules/settings/TypeAliases.js (RESERVED_TYPES, TYPE_ALIASES,
 * TYPE_FEATURES, RENDERER_ENTRIES, and BUILTIN_TYPES as its three partitions)
 * and the Tier 1 feature list in src/features/all.js. When the skill re-pins,
 * re-copy these from the new tag: a type that moves in or out of the default
 * bundle then fails the tests below until the catalog's `bundle` field follows.
 */
const V8_RESERVED_TYPES = ['icicle', 'unit', 'sunburst', 'violin'];
const V8_TYPE_ALIASES: Record<string, string> = {
  funnel: 'bar',
  pyramid: 'bar',
  gauge: 'radialBar',
  waffle: 'unit',
  histogram: 'bar',
  waterfall: 'rangeBar',
  dumbbell: 'rangeBar',
  streamgraph: 'rangeArea',
  raincloud: 'violin',
  column: 'bar',
};
const V8_TYPE_FEATURES: Record<string, string> = {
  histogram: 'stats',
  raincloud: 'raincloud',
  waterfall: 'waterfall',
  dumbbell: 'dumbbell',
  streamgraph: 'streamgraph',
};
const V8_RENDERER_ENTRIES: Record<string, string> = {
  area: 'line',
  scatter: 'line',
  bubble: 'line',
  rangeArea: 'line',
  column: 'bar',
  barStacked: 'bar',
  rangeBar: 'bar',
  boxPlot: 'candlestick',
  donut: 'pie',
  polarArea: 'pie',
};
const V8_BUILTIN_TYPES = [
  // XY_TYPES
  'line', 'area', 'bar', 'rangeBar', 'rangeArea', 'candlestick', 'boxPlot', 'violin', 'scatter', 'bubble',
  // AXIS_ONLY_TYPES
  'radar', 'heatmap', 'treemap',
  // NON_AXIS_TYPES
  'pie', 'donut', 'polarArea', 'radialBar', 'unit', 'sunburst', 'icicle',
];
const V8_TIER1_FEATURES = [
  'exports', 'legend', 'toolbar', 'annotations', 'keyboard', 'morph', 'weave', 'marks', 'facet', 'stats',
];

describe('chart catalog', () => {
  it('exports a catalog matching SUPPORTED_CHART_TYPES', () => {
    expect(CHART_CATALOG.map((c) => c.type)).toEqual(SUPPORTED_CHART_TYPES);
  });

  it('has unique chart type ids', () => {
    const ids = CHART_CATALOG.map((c) => c.type);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a family that maps to a real reference file', () => {
    for (const c of CHART_CATALOG) {
      expect(c.referenceFile).toMatch(/\.md$/);
      expect(['cartesian', 'bar', 'financial', 'circular', 'grid', 'radar', 'unit']).toContain(
        c.family,
      );
    }
  });

  it('uses non-axis (flat number array) format only for the pie-like and unit types', () => {
    // Non-axis = flat number array + top-level `labels`. Everything else (incl.
    // the axis-shaped hierarchy of sunburst) carries data in `[{ data }]` form.
    const nonAxis = new Set(['pie', 'donut', 'polarArea', 'radialBar', 'gauge', 'unit', 'waffle']);
    for (const c of CHART_CATALOG) {
      expect(c.seriesFormat, `${c.type} seriesFormat`).toBe(nonAxis.has(c.type) ? 'non-axis' : 'axis');
    }
  });

  it('lists histogram as an axis chart in the financial (statistical) family (v6.9)', () => {
    const info = getChartInfo('histogram');
    expect(info?.family).toBe('financial');
    expect(info?.seriesFormat).toBe('axis');
    expect(info?.dataFormat).toContain('raw observations');
  });

  it('getChartInfo round-trips for every type', () => {
    for (const t of SUPPORTED_CHART_TYPES) {
      expect(getChartInfo(t)?.type).toBe(t);
    }
  });

  it('getChartInfo returns undefined for unknown types', () => {
    expect(getChartInfo('sankey')).toBeUndefined();
  });

  it('lists column as bar under another name (v7.9)', () => {
    const column = getChartInfo('column');
    const bar = getChartInfo('bar');
    expect(column?.family).toBe(bar?.family);
    expect(column?.seriesFormat).toBe('axis');
    expect(column?.referenceFile).toBe(bar?.referenceFile);
    expect(column?.bundle).toBeUndefined();
  });

  it('holds exactly the chart.type values apexcharts v8.0.0 accepts', () => {
    // BUILTIN_TYPES plus the TYPE_ALIASES keys: what Config.assertKnownChartType
    // accepts, and the candidates its "did you mean" picks from.
    expect([...SUPPORTED_CHART_TYPES].sort()).toEqual(
      [...V8_BUILTIN_TYPES, ...Object.keys(V8_TYPE_ALIASES)].sort(),
    );
  });
});

describe('chart catalog: bundle tiers (pinned to apexcharts v8.0.0)', () => {
  it('marks as Tier 2 exactly the types the v8.0.0 default bundle cannot draw, with the imports the library names', () => {
    // Derived the way the library decides it. A type whose renderer is opt-in
    // (RESERVED_TYPES) throws from ChartFactory.getChartClass, whose message
    // names the alias's own entry when the alias has a feature, else the
    // renderer's entry. A type whose feature is outside features/all.js draws
    // empty from Data.applySeriesTransform, which names the feature (the
    // default bundle already has the renderer). histogram's stats is Tier 1.
    const expected: Record<string, unknown> = {};
    for (const type of SUPPORTED_CHART_TYPES) {
      const base = V8_TYPE_ALIASES[type] ?? type;
      const feature = V8_TYPE_FEATURES[type];
      if (V8_RESERVED_TYPES.includes(base)) {
        const renderer = V8_RENDERER_ENTRIES[base] ?? base;
        expected[type] = {
          import: `apexcharts/${feature ? type : renderer}`,
          scripts: feature ? [`dist/${renderer}.js`, `dist/features/${feature}.js`] : [`dist/${renderer}.js`],
          failure: 'throws',
        };
      } else if (feature && !V8_TIER1_FEATURES.includes(feature)) {
        expected[type] = {
          import: `apexcharts/features/${feature}`,
          scripts: [`dist/features/${feature}.js`],
          failure: 'draws-empty',
        };
      }
    }
    const actual = Object.fromEntries(
      CHART_CATALOG.filter((c) => c.bundle).map((c) => [
        c.type,
        { import: c.bundle!.import, scripts: c.bundle!.scripts, failure: c.bundle!.failure },
      ]),
    );
    expect(actual).toEqual(expected);
    expect([...TIER2_CHART_TYPES].sort()).toEqual(
      ['dumbbell', 'icicle', 'raincloud', 'streamgraph', 'sunburst', 'unit', 'violin', 'waffle', 'waterfall'],
    );
  });

  it('dates each Tier 2 type by the release that left it out of the default bundle', () => {
    const since = Object.fromEntries(CHART_CATALOG.filter((c) => c.bundle).map((c) => [c.type, c.bundle!.since]));
    expect(since).toEqual({
      waterfall: '8.0.0',
      dumbbell: '8.0.0',
      streamgraph: '8.0.0',
      raincloud: '7.1.0',
      violin: '8.0.0',
      icicle: '7.6.0',
      sunburst: '8.0.0',
      unit: '8.0.0',
      waffle: '8.0.0',
    });
  });

  it('keeps bundle claims out of the hand-written descriptions', () => {
    // The bundle sentence is generated from `bundle`, so prose cannot drift
    // from the data the way 8.0 left five descriptions stale.
    for (const c of CHART_CATALOG) {
      expect(c.description, c.type).not.toMatch(/default bundle|full bundle|opt-in|tier 2/i);
    }
  });

  it('generates a bundle sentence for every Tier 2 description, and none for Tier 1', () => {
    for (const c of CHART_CATALOG) {
      const text = describeChartType(c);
      if (c.bundle) {
        expect(text, c.type).toContain('Tier 2: not in the default bundle since v');
        expect(text, c.type).toContain(`\`import '${c.bundle.import}'\``);
        expect(text, c.type).toContain("'apexcharts/full'");
        for (const script of c.bundle.scripts) expect(text, c.type).toContain(script);
      } else {
        expect(text, c.type).toBe(c.description);
      }
    }
    expect(describeChartType(getChartInfo('raincloud')!)).toContain(
      'load dist/violin.js and then dist/features/raincloud.js with script tags',
    );
  });
});
