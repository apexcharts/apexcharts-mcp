import { describe, expect, it } from 'vitest';
import { CHART_CATALOG, getChartInfo } from '../src/chartCatalog.js';
import { generateChartConfig } from '../src/generateConfig.js';
import { validateChartConfig } from '../src/validateConfig.js';

function rules(result: ReturnType<typeof validateChartConfig>): string[] {
  return result.issues.map((i) => i.rule);
}

describe('validateChartConfig — structural', () => {
  it('flags non-object config', () => {
    const r = validateChartConfig(null);
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('config-not-object');
  });

  it('flags missing chart block', () => {
    const r = validateChartConfig({ series: [] });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('missing-chart');
  });

  it('flags missing chart.type', () => {
    const r = validateChartConfig({ chart: {} });
    expect(rules(r)).toContain('missing-chart-type');
  });

  it('warns, not errors, on a missing, null or empty chart.type: the library draws a line chart (v7.9)', () => {
    for (const type of [undefined, null, '']) {
      const r = validateChartConfig({ chart: { type }, series: [{ name: 'A', data: [1, 2] }] });
      expect(rules(r), `type ${JSON.stringify(type)}`).toEqual(['missing-chart-type']);
      expect(r.warnings.map((w) => w.rule)).toEqual(['missing-chart-type']);
      expect(r.ok).toBe(true);
    }
  });

  it('keeps validating a typeless config as a line chart', () => {
    const r = validateChartConfig({ chart: {}, series: [1, 2, 3] });
    expect(rules(r)).toEqual(['missing-chart-type', 'wrong-series-format-axis']);
  });

  it('errors on a chart.type that is set but not a string (the library throws)', () => {
    const r = validateChartConfig({ chart: { type: 123 }, series: [{ name: 'A', data: [1] }] });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.rule)).toEqual(['missing-chart-type']);
    expect(r.errors[0].message).toContain('must be a string');
  });

  it('flags unknown chart.type', () => {
    const r = validateChartConfig({ chart: { type: 'sankey' }, series: [] });
    expect(rules(r)).toContain('unknown-chart-type');
  });

  it('names the nearest type for an unknown chart.type, like the library (v7.9)', () => {
    const fixOf = (type: string) => validateChartConfig({ chart: { type }, series: [] }).issues[0].fix ?? '';
    expect(fixOf('Bar')).toMatch(/^Did you mean "bar"\?/);
    expect(fixOf('colum')).toMatch(/^Did you mean "column"\?/);
    expect(fixOf('pie ')).toMatch(/^Did you mean "pie"\?/);
    expect(fixOf('sankey')).not.toContain('Did you mean');
    expect(fixOf('sankey')).toContain('registerSeriesType');
  });

  it('flags missing series', () => {
    const r = validateChartConfig({ chart: { type: 'line' } });
    expect(rules(r)).toContain('missing-series');
  });

  it('flags non-array series', () => {
    const r = validateChartConfig({ chart: { type: 'line' }, series: 'foo' });
    expect(rules(r)).toContain('series-not-array');
  });
});

describe('validateChartConfig — series format', () => {
  it('flags axis-format series on a pie chart', () => {
    const r = validateChartConfig({
      chart: { type: 'pie' },
      series: [{ name: 'A', data: [44, 55] }],
      labels: ['A', 'B'],
    });
    expect(rules(r)).toContain('wrong-series-format-non-axis');
  });

  it('flags flat-number series on a line chart', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [44, 55, 13],
    });
    expect(rules(r)).toContain('wrong-series-format-axis');
  });

  it('accepts a correct line config', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'Sales', data: [10, 20, 30] }],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts a correct pie config', () => {
    const r = validateChartConfig({
      chart: { type: 'pie' },
      series: [44, 55, 13],
      labels: ['A', 'B', 'C'],
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateChartConfig — non-axis specifics', () => {
  it('warns when a pie chart is missing labels', () => {
    const r = validateChartConfig({ chart: { type: 'pie' }, series: [44, 55, 13] });
    expect(r.ok).toBe(true); // missing labels is a warning
    expect(rules(r)).toContain('missing-labels-non-axis');
  });

  it('errors on labels/series length mismatch', () => {
    const r = validateChartConfig({
      chart: { type: 'pie' },
      series: [44, 55, 13],
      labels: ['A', 'B'],
    });
    expect(rules(r)).toContain('labels-length-mismatch');
  });

  it('flags radialBar values outside 0–100', () => {
    const r = validateChartConfig({
      chart: { type: 'radialBar' },
      series: [76, 340, 61],
      labels: ['A', 'B', 'C'],
    });
    const radialIssues = r.issues.filter((i) => i.rule === 'radialbar-out-of-range');
    expect(radialIssues).toHaveLength(1);
    expect(radialIssues[0].path).toBe('series[1]');
  });
});

describe('validateChartConfig — axis data point shapes', () => {
  it('flags bubble points missing z', () => {
    const r = validateChartConfig({
      chart: { type: 'bubble' },
      series: [{ name: 'A', data: [{ x: 1, y: 5 }] }],
    });
    expect(rules(r)).toContain('bubble-missing-z');
  });

  it('flags candlestick y not OHLC', () => {
    const r = validateChartConfig({
      chart: { type: 'candlestick' },
      series: [{ data: [{ x: 1, y: [10, 20, 30] }] }],
    });
    expect(rules(r)).toContain('candlestick-wrong-y-length');
  });

  it('flags box plot y not 5-element', () => {
    const r = validateChartConfig({
      chart: { type: 'boxPlot' },
      series: [{ data: [{ x: 'A', y: [10, 20, 30, 40] }] }],
    });
    expect(rules(r)).toContain('boxplot-wrong-y-length');
  });

  it('flags rangeBar y not 2-element', () => {
    const r = validateChartConfig({
      chart: { type: 'rangeBar' },
      series: [{ data: [{ x: 'Task', y: [1, 5, 9] }] }],
    });
    expect(rules(r)).toContain('range-wrong-y-length');
  });

  it('flags violin points missing a density profile (v6)', () => {
    const r = validateChartConfig({
      chart: { type: 'violin' },
      series: [{ name: 'A', data: [{ x: 'Group A', y: 42 }] }],
    });
    expect(rules(r)).toContain('violin-missing-density');
  });

  it('accepts a well-formed violin point (v6)', () => {
    const r = validateChartConfig({
      chart: { type: 'violin' },
      series: [
        {
          name: 'A',
          data: [{ x: 'Group A', y: { density: [[20, 0.1], [30, 0.2]], points: [21, 29] } }],
        },
      ],
    });
    expect(rules(r)).not.toContain('violin-missing-density');
  });

  it('flags object-form data points on a histogram (v6.9)', () => {
    const r = validateChartConfig({
      chart: { type: 'histogram' },
      series: [{ name: 'Latency', data: [{ x: '0-50', y: 12 }] }],
    });
    expect(rules(r)).toContain('histogram-data-not-raw');
  });

  it('accepts raw numeric observations (with null gaps) on a histogram (v6.9)', () => {
    const r = validateChartConfig({
      chart: { type: 'histogram' },
      series: [{ name: 'Latency', data: [102, 87, null, 143, 91] }],
    });
    expect(r.ok).toBe(true);
    expect(rules(r)).not.toContain('histogram-data-not-raw');
  });

  it('flags a sunburst node missing an x label (v6.7)', () => {
    const r = validateChartConfig({
      chart: { type: 'sunburst' },
      series: [{ data: [{ y: 40, children: [{ x: 'A', y: 10 }] }] }],
    });
    expect(rules(r)).toContain('sunburst-node-missing-x');
  });

  it('flags sunburst children that are not an array (v6.7)', () => {
    const r = validateChartConfig({
      chart: { type: 'sunburst' },
      series: [{ data: [{ x: 'Root', y: 40, children: { x: 'A' } }] }],
    });
    expect(rules(r)).toContain('sunburst-children-not-array');
  });

  it('flags a missing x deep in the sunburst hierarchy (v6.7)', () => {
    const r = validateChartConfig({
      chart: { type: 'sunburst' },
      series: [
        {
          data: [{ x: 'Root', y: 40, children: [{ x: 'A', y: 20, children: [{ y: 5 }] }] }],
        },
      ],
    });
    const miss = r.issues.filter((i) => i.rule === 'sunburst-node-missing-x');
    expect(miss).toHaveLength(1);
    expect(miss[0].path).toBe('series[0].data[0].children[0].children[0].x');
  });

  it('accepts a well-formed sunburst hierarchy (v6.7)', () => {
    const r = validateChartConfig({
      chart: { type: 'sunburst' },
      series: [
        {
          data: [
            { x: 'A', y: 40, children: [{ x: 'A1', y: 25 }, { x: 'A2', y: 15 }] },
            { x: 'B', y: 20 },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(rules(r)).not.toContain('sunburst-node-missing-x');
    expect(rules(r)).not.toContain('sunburst-children-not-array');
  });

  it('validates an icicle hierarchy the same way, under its own rule ids (v7.6)', () => {
    const missingX = validateChartConfig({
      chart: { type: 'icicle' },
      series: [{ data: [{ y: 40, children: [{ x: 'A', y: 10 }] }] }],
    });
    expect(rules(missingX)).toContain('icicle-node-missing-x');
    // The sunburst ids stay the sunburst's: callers pattern-match on them.
    expect(rules(missingX)).not.toContain('sunburst-node-missing-x');

    const badChildren = validateChartConfig({
      chart: { type: 'icicle' },
      series: [{ data: [{ x: 'Root', y: 40, children: { x: 'A' } }] }],
    });
    expect(rules(badChildren)).toContain('icicle-children-not-array');

    const deep = validateChartConfig({
      chart: { type: 'icicle' },
      series: [{ data: [{ x: 'Root', y: 40, children: [{ x: 'A', y: 20, children: [{ y: 5 }] }] }] }],
    });
    const miss = deep.issues.filter((i) => i.rule === 'icicle-node-missing-x');
    expect(miss).toHaveLength(1);
    expect(miss[0].path).toBe('series[0].data[0].children[0].children[0].x');
  });

  it('accepts an icicle branch that omits its own y (v7.6)', () => {
    // A branch may be the sum of its children. That is the documented shape for
    // both partition types, and requiring y here would reject it.
    const r = validateChartConfig({
      chart: { type: 'icicle' },
      series: [
        {
          data: [
            { x: 'Root', children: [{ x: 'A', y: 25 }, { x: 'B', y: 15 }] },
            { x: 'Other', y: 20 },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(rules(r)).not.toContain('icicle-node-missing-x');
    expect(rules(r)).not.toContain('icicle-children-not-array');
  });

  it('flags undefined data points (use null instead)', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, undefined, 30] }],
    });
    const undef = r.issues.filter((i) => i.rule === 'undefined-data-point');
    expect(undef).toHaveLength(1);
    expect(undef[0].path).toBe('series[0].data[1]');
  });

  it('does not flag null data points', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, null, 30] }],
    });
    expect(rules(r)).not.toContain('undefined-data-point');
  });
});

describe('validateChartConfig — premium chart types', () => {
  it('warns (not errors) that unit and waffle are premium', () => {
    for (const type of ['unit', 'waffle'] as const) {
      const r = validateChartConfig({
        chart: { type },
        series: [40, 30, 20, 10],
        labels: ['A', 'B', 'C', 'D'],
      });
      expect(rules(r)).toContain('premium-chart-type');
      // premium is a warning, so a well-formed config still validates ok
      expect(r.ok).toBe(true);
      expect(r.warnings.some((w) => w.rule === 'premium-chart-type')).toBe(true);
    }
  });

  it('does not flag free chart types as premium', () => {
    const r = validateChartConfig({
      chart: { type: 'sunburst' },
      series: [{ data: [{ x: 'A', y: 40 }] }],
    });
    expect(rules(r)).not.toContain('premium-chart-type');
  });
});

describe('validateChartConfig — other rules', () => {
  it('flags chart.stacked on scatter', () => {
    const r = validateChartConfig({
      chart: { type: 'scatter', stacked: true },
      series: [{ name: 'A', data: [{ x: 1, y: 2 }] }],
    });
    expect(rules(r)).toContain('stacked-on-unsupported-type');
  });

  it('allows chart.stacked on bar', () => {
    const r = validateChartConfig({
      chart: { type: 'bar', stacked: true },
      series: [{ name: 'A', data: [10, 20] }],
    });
    expect(rules(r)).not.toContain('stacked-on-unsupported-type');
  });

  it('accepts chart.type column, a synonym the library rewrites to bar (v7.9)', () => {
    const r = validateChartConfig({
      chart: { type: 'column' },
      series: [{ name: 'A', data: [10, 20, 30] }],
      xaxis: { categories: ['Q1', 'Q2', 'Q3'] },
    });
    expect(r.issues).toEqual([]);
  });

  it('allows chart.stacked on column, as on bar', () => {
    const r = validateChartConfig({
      chart: { type: 'column', stacked: true },
      series: [
        { name: 'A', data: [10, 20] },
        { name: 'B', data: [5, 8] },
      ],
    });
    expect(r.issues).toEqual([]);
  });

  it('flags tooltip.shared and tooltip.intersect both true', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, 20] }],
      tooltip: { shared: true, intersect: true },
    });
    expect(rules(r)).toContain('tooltip-shared-and-intersect');
  });

  it('flags hex colors without #', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, 20] }],
      colors: ['FF5733', '#33FF57'],
    });
    const hex = r.issues.filter((i) => i.rule === 'hex-missing-hash');
    expect(hex).toHaveLength(1);
    expect(hex[0].path).toBe('colors[0]');
  });

  it('does not flag named CSS colors', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, 20] }],
      colors: ['red', 'blue'],
    });
    expect(rules(r)).not.toContain('hex-missing-hash');
  });

  it('accepts responsive breakpoints in any order (the library sorts them)', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, 20] }],
      responsive: [{ breakpoint: 1024 }, { breakpoint: 480 }],
    });
    expect(r.issues).toEqual([]);
  });

  it('does not warn about a single yaxis shared by several series', () => {
    const r = validateChartConfig({
      chart: { type: 'bar' },
      plotOptions: { bar: { horizontal: true } },
      series: [
        { name: 'Revenue', data: [10, 20] },
        { name: 'Profit', data: [3, 5] },
      ],
      yaxis: { title: { text: 'Value' } },
    });
    expect(r.issues).toEqual([]);
  });
});

describe('validateChartConfig: v7.1 chart types', () => {
  it('accepts a violin point supplying only a raw sample (v6.9)', () => {
    const r = validateChartConfig({
      chart: { type: 'violin' },
      series: [{ name: 'A', data: [{ x: 'Group A', points: [21, 29, 33] }] }],
    });
    expect(rules(r)).not.toContain('violin-missing-density');
  });

  it('flags a raincloud point with no raw sample', () => {
    const r = validateChartConfig({
      chart: { type: 'raincloud' },
      series: [{ name: 'A', data: [{ x: 'Control', y: 42 }] }],
    });
    expect(rules(r)).toContain('raincloud-missing-points');
  });

  it('warns that raincloud is not in the default bundle (Tier 2)', () => {
    const r = validateChartConfig({
      chart: { type: 'raincloud' },
      series: [{ name: 'A', data: [{ x: 'Control', points: [1, 2, 3] }] }],
    });
    expect(rules(r)).toContain('tier2-chart-type');
    expect(rules(r)).toContain('premium-chart-type');
    expect(r.ok).toBe(true);
  });

  it("gives raincloud the v8.0 fix: its own entry, or violin.js before the feature's script", () => {
    const r = validateChartConfig({
      chart: { type: 'raincloud' },
      series: [{ name: 'A', data: [{ x: 'Control', points: [1, 2, 3] }] }],
    });
    const tier2 = r.issues.find((i) => i.rule === 'tier2-chart-type');
    expect(tier2?.message).toContain('render() rejects');
    expect(tier2?.fix).toContain("`import 'apexcharts/raincloud'`");
    expect(tier2?.fix).toContain('dist/violin.js and then dist/features/raincloud.js');
    expect(tier2?.fix).toContain("'apexcharts/full'");
    // The feature alone is no longer a route on the default bundle.
    expect(tier2?.fix).toContain("'apexcharts/features/raincloud' alone works only where violin is already registered");
  });

  it('warns that a waterfall row with neither a value nor a total flag renders as a gap', () => {
    const r = validateChartConfig({
      chart: { type: 'waterfall' },
      series: [{ name: 'W', data: [{ x: 'Revenue' }] }],
    });
    expect(rules(r)).toContain('waterfall-missing-value');
    expect(r.ok).toBe(true);
  });

  it('accepts y: null on a waterfall row as an intended gap', () => {
    const r = validateChartConfig({
      chart: { type: 'waterfall' },
      series: [{ name: 'W', data: [{ x: 'Q1', y: 100 }, { x: 'Q2', y: null }, { x: 'End', isTotal: true }] }],
    });
    // Only the v8.0 import advisory, which every waterfall carries.
    expect(rules(r)).toEqual(['tier2-chart-type']);
  });

  it('warns when a waterfall running-total row also carries a value', () => {
    const r = validateChartConfig({
      chart: { type: 'waterfall' },
      series: [{ name: 'W', data: [{ x: 'Gross profit', isSubtotal: true, y: 6000 }] }],
    });
    expect(rules(r)).toContain('waterfall-total-with-value');
  });

  it('accepts a waterfall mixing steps and running totals', () => {
    const r = validateChartConfig({
      chart: { type: 'waterfall' },
      series: [
        {
          name: 'W',
          data: [
            { x: 'Revenue', y: 8786 },
            { x: 'Cost', y: -2786 },
            { x: 'Gross profit', isSubtotal: true },
            { x: 'Operating income', isTotal: true },
          ],
        },
      ],
    });
    expect(r.errors).toEqual([]);
  });

  it('accepts a single dumbbell series of [low, high] pairs (passed straight through)', () => {
    const r = validateChartConfig({
      chart: { type: 'dumbbell' },
      series: [{ name: 'Gap', data: [{ x: 'Backend', y: [92, 118] }] }],
    });
    expect(rules(r)).toEqual(['tier2-chart-type']);
  });

  it('warns when a dumbbell has only one series', () => {
    const r = validateChartConfig({
      chart: { type: 'dumbbell' },
      series: [{ name: '2020', data: [{ x: 'Backend', y: 92 }] }],
    });
    expect(rules(r)).toContain('dumbbell-single-series');
    expect(r.ok).toBe(true);
  });

  it('accepts a two-series dumbbell', () => {
    const r = validateChartConfig({
      chart: { type: 'dumbbell' },
      series: [
        { name: '2020', data: [{ x: 'Backend', y: 92 }] },
        { name: '2025', data: [{ x: 'Backend', y: 118 }] },
      ],
    });
    expect(rules(r)).toEqual(['tier2-chart-type']);
  });

  it('warns about chart.stacked on a streamgraph instead of erroring', () => {
    const r = validateChartConfig({
      chart: { type: 'streamgraph', stacked: true },
      series: [{ name: 'Drama', data: [{ x: '2024-01-01', y: 32 }] }],
    });
    expect(rules(r)).toContain('stacked-on-streamgraph');
    expect(rules(r)).not.toContain('stacked-on-unsupported-type');
    expect(r.ok).toBe(true);
  });

  it('allows chart.stacked on line, including a mixed chart', () => {
    const r = validateChartConfig({
      chart: { type: 'line', stacked: true },
      series: [
        { name: 'A', type: 'bar', data: [1, 2] },
        { name: 'T', type: 'line', data: [4, 6] },
      ],
    });
    expect(r.issues).toEqual([]);
  });

  it('warns that waterfall and dumbbell switch chart.stacked off', () => {
    const r = validateChartConfig({
      chart: { type: 'waterfall', stacked: true },
      series: [{ name: 'W', data: [{ x: 'Revenue', y: 10 }] }],
    });
    expect(rules(r)).toEqual(['stacked-ignored', 'tier2-chart-type']);
    expect(r.ok).toBe(true);
  });
});

describe('validateChartConfig: Tier 2 chart types (apexcharts 8.0)', () => {
  // One minimal, well-formed config per Tier 2 type.
  const configs: Record<string, Record<string, unknown>> = {
    unit: { chart: { type: 'unit' }, series: [4, 3], labels: ['A', 'B'] },
    waffle: { chart: { type: 'waffle' }, series: [4, 3], labels: ['A', 'B'] },
    sunburst: { chart: { type: 'sunburst' }, series: [{ data: [{ x: 'A', y: 1 }] }] },
    icicle: { chart: { type: 'icicle' }, series: [{ data: [{ x: 'A', y: 1 }] }] },
    violin: { chart: { type: 'violin' }, series: [{ name: 'S', data: [{ x: 'A', points: [1, 2, 3] }] }] },
    raincloud: { chart: { type: 'raincloud' }, series: [{ name: 'S', data: [{ x: 'A', points: [1, 2, 3] }] }] },
    waterfall: { chart: { type: 'waterfall' }, series: [{ name: 'W', data: [{ x: 'A', y: 1 }] }] },
    dumbbell: {
      chart: { type: 'dumbbell' },
      series: [
        { name: 'A', data: [{ x: 'X', y: 1 }] },
        { name: 'B', data: [{ x: 'X', y: 2 }] },
      ],
    },
    streamgraph: { chart: { type: 'streamgraph' }, series: [{ name: 'S', data: [{ x: 'A', y: 1 }] }] },
  };

  it('covers exactly the catalog\'s Tier 2 types', () => {
    expect(Object.keys(configs).sort()).toEqual(
      CHART_CATALOG.filter((c) => c.bundle).map((c) => c.type).sort(),
    );
  });

  for (const [type, config] of Object.entries(configs)) {
    it(`warns that ${type} needs its import, naming it, its script tags and the full bundle`, () => {
      const b = getChartInfo(type)!.bundle!;
      const r = validateChartConfig(config);
      const tier2 = r.issues.filter((i) => i.rule === 'tier2-chart-type');
      expect(tier2).toHaveLength(1);
      expect(tier2[0].severity).toBe('warning');
      expect(tier2[0].path).toBe('chart.type');
      expect(tier2[0].message).toContain(
        b.failure === 'throws' ? 'render() rejects' : 'the chart draws nothing',
      );
      expect(tier2[0].fix).toContain(`\`import '${b.import}'\``);
      for (const script of b.scripts) expect(tier2[0].fix).toContain(script);
      expect(tier2[0].fix).toContain("`import ApexCharts from 'apexcharts/full'`");
      expect(r.errors).toEqual([]);
    });
  }

  it('recommends only the feature for waterfall, dumbbell and streamgraph on the default bundle', () => {
    for (const type of ['waterfall', 'dumbbell', 'streamgraph']) {
      const fix = validateChartConfig(configs[type]).issues.find((i) => i.rule === 'tier2-chart-type')?.fix;
      expect(fix).toContain(`\`import 'apexcharts/features/${type}'\``);
    }
  });

  it('warns for a violin series in a combo whose own type is in the default bundle', () => {
    const r = validateChartConfig({
      chart: { type: 'boxPlot' },
      series: [
        { name: 'Box', type: 'boxPlot', data: [{ x: 'A', y: [1, 2, 3, 4, 5] }] },
        { name: 'Violin', type: 'violin', data: [{ x: 'A', points: [1, 2, 3] }] },
      ],
    });
    const tier2 = r.issues.filter((i) => i.rule === 'tier2-chart-type');
    expect(tier2).toHaveLength(1);
    expect(tier2[0].path).toBe('series[1].type');
    expect(tier2[0].fix).toContain("`import 'apexcharts/violin'`");
  });

  it('warns once when a violin chart also names violin on a series', () => {
    const r = validateChartConfig({
      chart: { type: 'violin' },
      series: [{ name: 'V', type: 'violin', data: [{ x: 'A', points: [1, 2, 3] }] }],
    });
    expect(rules(r).filter((id) => id === 'tier2-chart-type')).toHaveLength(1);
  });

  it('never warns for a type the default bundle has', () => {
    for (const c of CHART_CATALOG.filter((info) => !info.bundle)) {
      const r = validateChartConfig(generateChartConfig({ type: c.type }));
      expect(rules(r), c.type).not.toContain('tier2-chart-type');
    }
  });
});

describe('validateChartConfig: features that need an import', () => {
  const base = { chart: { type: 'bar' }, series: [{ name: 'A', data: [1, 2] }] };

  it('warns that drilldown is not in the default bundle since 8.0', () => {
    const r = validateChartConfig({ ...base, drilldown: { enabled: true, series: [] } });
    expect(rules(r)).toEqual(['feature-needs-import']);
    expect(r.issues[0].path).toBe('drilldown.enabled');
    expect(r.issues[0].fix).toContain("`import 'apexcharts/features/drilldown'`");
    expect(r.issues[0].fix).toContain('dist/features/drilldown.js');
    expect(r.ok).toBe(true);
  });

  it('stays quiet for a drilldown block that is not enabled (the default)', () => {
    const r = validateChartConfig({ ...base, drilldown: { series: [] } });
    expect(r.issues).toEqual([]);
  });

  it('warns about highlight parts wherever the library looks for them (v7.9)', () => {
    const at = (config: Record<string, unknown>) =>
      validateChartConfig(config).issues.filter((i) => i.rule === 'feature-needs-import').map((i) => i.path);
    expect(at({ ...base, highlightFilter: { data: [[1, 1]] } })).toEqual(['highlightFilter.data']);
    expect(at({ ...base, series: [{ name: 'A', data: [1, 2], highlightData: [0.5, 1] }] })).toEqual([
      'series[0].highlightData',
    ]);
    expect(at({ ...base, series: [{ name: 'A', data: [{ x: 'a', y: 2, highlight: 1 }] }] })).toEqual([
      'series[0].data[0].highlight',
    ]);
    // The library reads only a series' first point, so a part further in is not "in use".
    expect(at({ ...base, series: [{ name: 'A', data: [{ x: 'a', y: 2 }, { x: 'b', y: 3, highlight: 1 }] }] })).toEqual(
      [],
    );
  });

  it('says highlight-filter is premium and names its import', () => {
    const r = validateChartConfig({ ...base, highlightFilter: { data: [[1, 1]] } });
    expect(r.issues[0].message).toContain('premium');
    expect(r.issues[0].fix).toContain("`import 'apexcharts/features/highlight-filter'`");
  });
});

describe('validateChartConfig: what 7.9 started warning about', () => {
  const base = { chart: { type: 'line' }, series: [{ name: 'A', data: [1, 2] }] };

  it('warns about a top-level key the library never reads, naming the nearest real one', () => {
    const r = validateChartConfig({ ...base, xAxis: { categories: ['a', 'b'] }, zaxis: {}, myMeta: 1 });
    const unknown = r.issues.filter((i) => i.rule === 'unknown-option-key');
    expect(unknown.map((i) => i.path)).toEqual(['xAxis', 'zaxis', 'myMeta']);
    expect(unknown[0].fix).toBe('Did you mean "xaxis"?');
    // Ties go to the earlier name, as in Options.init()'s key order.
    expect(unknown[1].fix).toBe('Did you mean "xaxis"?');
    expect(unknown[2].fix).not.toContain('Did you mean');
    expect(r.ok).toBe(true);
  });

  it('knows every top-level option apexcharts 8.0 reads', () => {
    const r = validateChartConfig({
      ...base,
      annotations: {}, plugins: [], trellis: {}, parsing: undefined, plotOptions: {}, colors: [],
      dataLabels: {}, fill: {}, forecastDataPoints: {}, highlightFilter: {}, grid: {}, labels: [],
      drilldown: {}, legend: {}, markers: {}, noData: {}, responsive: [], states: {}, title: {},
      subtitle: {}, stroke: {}, tooltip: {}, xaxis: {}, yaxis: {}, theme: {},
    });
    expect(rules(r)).not.toContain('unknown-option-key');
  });

  it('warns about an axis bound that cannot be read as a number', () => {
    const paths = (config: Record<string, unknown>) =>
      validateChartConfig({ ...base, ...config })
        .issues.filter((i) => i.rule === 'unparseable-axis-bound')
        .map((i) => i.path);
    expect(paths({ yaxis: { min: 'abc' } })).toEqual(['yaxis.min']);
    expect(paths({ yaxis: [{ min: 0 }, { max: '90%' }] })).toEqual(['yaxis[1].max']);
    expect(paths({ yaxis: { min: true, max: '' } })).toEqual(['yaxis.min', 'yaxis.max']);
    expect(paths({ xaxis: { min: 'Feb' } })).toEqual(['xaxis.min']);
    expect(paths({ yaxis: { min: NaN } })).toEqual(['yaxis.min']);
  });

  it('prints a non-finite bound as the number it is, not as null', () => {
    const messages = (config: Record<string, unknown>) =>
      validateChartConfig({ ...base, ...config })
        .issues.filter((i) => i.rule === 'unparseable-axis-bound')
        .map((i) => i.message);
    const [nan] = messages({ yaxis: { min: NaN } });
    expect(nan).toContain('yaxis.min is NaN');
    expect(nan).not.toContain('null');
    expect(messages({ yaxis: { max: Infinity } })[0]).toContain('yaxis.max is Infinity');
  });

  it('accepts the bounds the library converts or leaves alone', () => {
    const paths = (config: Record<string, unknown>) =>
      validateChartConfig({ ...base, ...config })
        .issues.filter((i) => i.rule === 'unparseable-axis-bound')
        .map((i) => i.path);
    // Numeric strings convert since 7.9; null leaves the bound unset.
    expect(paths({ yaxis: { min: '10', max: ' 90 ' } })).toEqual([]);
    expect(paths({ yaxis: { min: null, max: 100 } })).toEqual([]);
    // A datetime axis parses dates, which this check does not judge.
    expect(paths({ xaxis: { type: 'datetime', min: '2024-01-01' } })).toEqual([]);
  });

  it('hints at xaxis.type datetime for an x bound, but not for a y bound', () => {
    const r = validateChartConfig({ ...base, xaxis: { min: '2024-01-01' }, yaxis: { min: 'low' } });
    const [x, y] = r.issues.filter((i) => i.rule === 'unparseable-axis-bound');
    expect(x.fix).toContain('xaxis.type: "datetime"');
    expect(y.fix).not.toContain('datetime');
  });
});

describe('validateChartConfig: forms the library accepts (audited against 7.8.0)', () => {
  it('accepts the { x, y } object form on a pie, with labels taken from x', () => {
    const r = validateChartConfig({
      chart: { type: 'pie' },
      series: [{ data: [{ x: 'A', y: 44 }, { x: 'B', y: 55 }] }],
    });
    expect(r.issues).toEqual([]);
  });

  it('accepts per-unit records on a unit chart', () => {
    const r = validateChartConfig({
      chart: { type: 'unit' },
      series: [{ name: 'Eng', data: [{ name: 'Ana' }, { name: 'Ben' }] }],
    });
    expect(r.errors).toEqual([]);
  });

  it('accepts { name, data } panels on a trellised radialBar', () => {
    const r = validateChartConfig({
      chart: { type: 'radialBar' },
      trellis: { by: 'store' },
      series: [{ name: 'X', store: 'A', data: [88] }],
    });
    expect(r.errors).toEqual([]);
  });

  it('accepts raw records mapped by parsing, on pie and on bubble', () => {
    const pie = validateChartConfig({
      chart: { type: 'pie' },
      series: [{ data: [{ k: 'A', v: 4 }], parsing: { x: 'k', y: 'v' } }],
    });
    const bubble = validateChartConfig({
      chart: { type: 'bubble' },
      series: [{ name: 'S', data: [{ a: 1, b: 2, c: 30 }], parsing: { x: 'a', y: 'b', z: 'c' } }],
    });
    expect(pie.errors).toEqual([]);
    expect(bubble.errors).toEqual([]);
  });

  it('honours plotOptions.radialBar.min and max', () => {
    const inside = validateChartConfig({
      chart: { type: 'radialBar' },
      plotOptions: { radialBar: { min: 0, max: 240 } },
      series: [180],
      labels: ['Speed'],
    });
    const outside = validateChartConfig({
      chart: { type: 'radialBar' },
      plotOptions: { radialBar: { min: 0, max: 240 } },
      series: [300],
      labels: ['Speed'],
    });
    expect(inside.issues).toEqual([]);
    expect(rules(outside)).toEqual(['radialbar-out-of-range']);
  });

  it('accepts { y } objects and one-element arrays as histogram observations', () => {
    const r = validateChartConfig({
      chart: { type: 'histogram' },
      series: [{ name: 'L', data: [{ y: 102 }, { y: 87 }, [143], 91] }],
    });
    expect(r.issues).toEqual([]);
  });

  it('accepts a flat number y on violin and a precomputed density on raincloud', () => {
    const violin = validateChartConfig({
      chart: { type: 'violin' },
      series: [{ name: 'S', data: [{ x: 'A', y: [1, 2, 2, 3, 4] }] }],
    });
    const raincloud = validateChartConfig({
      chart: { type: 'raincloud' },
      series: [{ name: 'S', data: [{ x: 'A', y: { density: [[1, 0.2], [2, 0.5]], summary: [1, 1.5, 2, 2.5, 3] } }] }],
    });
    expect(violin.errors).toEqual([]);
    expect(raincloud.errors).toEqual([]);
  });

  it('accepts the name alias on sunburst children', () => {
    const r = validateChartConfig({
      chart: { type: 'sunburst' },
      series: [{ data: [{ x: 'Root', children: [{ name: 'a', value: 1 }] }] }],
    });
    expect(r.errors).toEqual([]);
  });

  it('warns that icicle needs its own entry point', () => {
    const r = validateChartConfig({
      chart: { type: 'icicle' },
      series: [{ data: [{ x: 'Root', y: 1 }] }],
    });
    expect(rules(r)).toEqual(['tier2-chart-type']);
  });

  it('does not ask a sparkline for labels', () => {
    const r = validateChartConfig({
      chart: { type: 'donut', sparkline: { enabled: true } },
      series: [44, 55],
    });
    expect(r.issues).toEqual([]);
  });
});

describe('validateChartConfig — result shape', () => {
  it('separates errors and warnings', () => {
    const r = validateChartConfig({
      chart: { type: 'pie' },
      series: [44, 55],
      // missing labels => warning
    });
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });

  it('ok is false when any error is present', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [44, 55, 13], // wrong-series-format-axis
    });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
