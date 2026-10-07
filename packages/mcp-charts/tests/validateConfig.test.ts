import { describe, expect, it } from 'vitest';
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

  it('flags unknown chart.type', () => {
    const r = validateChartConfig({ chart: { type: 'sankey' }, series: [] });
    expect(rules(r)).toContain('unknown-chart-type');
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
    expect(r.issues).toEqual([]);
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
    expect(r.issues).toEqual([]);
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
    expect(r.issues).toEqual([]);
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
    expect(rules(r)).toEqual(['stacked-ignored']);
    expect(r.ok).toBe(true);
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
