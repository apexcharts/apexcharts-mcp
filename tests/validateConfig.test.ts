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

  it('warns on single yaxis object with multiple distinctly-named series', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [
        { name: 'Revenue', data: [10, 20] },
        { name: 'Profit', data: [3, 5] },
      ],
      yaxis: { title: { text: 'Value' } },
    });
    expect(rules(r)).toContain('yaxis-single-with-multiple-series');
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

  it('flags responsive breakpoints not ascending', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, 20] }],
      responsive: [{ breakpoint: 1024 }, { breakpoint: 480 }],
    });
    expect(rules(r)).toContain('responsive-not-ascending');
  });

  it('accepts ascending responsive breakpoints', () => {
    const r = validateChartConfig({
      chart: { type: 'line' },
      series: [{ name: 'A', data: [10, 20] }],
      responsive: [{ breakpoint: 480 }, { breakpoint: 1024 }],
    });
    expect(rules(r)).not.toContain('responsive-not-ascending');
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
