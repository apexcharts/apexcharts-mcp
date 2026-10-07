import { describe, expect, it } from 'vitest';
import { SUPPORTED_CHART_TYPES } from '../src/chartCatalog.js';
import { generateChartConfig } from '../src/generateConfig.js';
import { validateChartConfig } from '../src/validateConfig.js';

describe('generateChartConfig', () => {
  it('builds a minimal line chart with default placeholder data', () => {
    const config = generateChartConfig({ type: 'line' });

    expect(config.chart).toMatchObject({ type: 'line', height: 350 });
    expect(Array.isArray(config.series)).toBe(true);
    const series = config.series as Array<{ name: string; data: number[] }>;
    expect(series[0].name).toBe('Series 1');
    expect(series[0].data.length).toBeGreaterThan(0);
    expect((config.xaxis as { categories: string[] }).categories.length).toBe(series[0].data.length);
  });

  it('uses a flat number series and labels for pie charts', () => {
    const config = generateChartConfig({ type: 'pie' });

    expect((config.chart as { type: string }).type).toBe('pie');
    expect(Array.isArray(config.series)).toBe(true);
    const series = config.series as unknown[];
    expect(series.every((s) => typeof s === 'number')).toBe(true);
    expect(Array.isArray(config.labels)).toBe(true);
    expect((config.labels as string[]).length).toBe(series.length);
  });

  it('honors stacked option only for bar/area/line types', () => {
    const stackedBar = generateChartConfig({ type: 'bar', stacked: true });
    expect((stackedBar.chart as { stacked?: boolean }).stacked).toBe(true);

    const stackedLine = generateChartConfig({ type: 'line', stacked: true });
    expect((stackedLine.chart as { stacked?: boolean }).stacked).toBe(true);

    const stackedScatter = generateChartConfig({ type: 'scatter', stacked: true });
    expect((stackedScatter.chart as { stacked?: boolean }).stacked).toBeUndefined();
  });

  it('passes horizontal through plotOptions.bar for bar charts', () => {
    const config = generateChartConfig({ type: 'bar', horizontal: true });
    expect(config.plotOptions).toEqual({ bar: { horizontal: true } });
  });

  it('uses provided categories instead of defaults', () => {
    const config = generateChartConfig({
      type: 'line',
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    });
    expect((config.xaxis as { categories: string[] }).categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('throws on unsupported chart type', () => {
    expect(() => generateChartConfig({ type: 'sankey' })).toThrow(/Unsupported chart type/);
  });

  it('uses XY object format for scatter', () => {
    const config = generateChartConfig({ type: 'scatter' });
    const series = config.series as Array<{ data: Array<{ x: number; y: number }> }>;
    expect(series[0].data[0]).toHaveProperty('x');
    expect(series[0].data[0]).toHaveProperty('y');
    // scatter does not use xaxis.categories
    expect(config.xaxis).toBeUndefined();
  });

  it('emits z dimension for bubble', () => {
    const config = generateChartConfig({ type: 'bubble' });
    const series = config.series as Array<{ data: Array<{ x: number; y: number; z: number }> }>;
    expect(series[0].data[0]).toHaveProperty('z');
  });

  it('keeps radialBar values within the 0–100 range', () => {
    const config = generateChartConfig({ type: 'radialBar' });
    const series = config.series as number[];
    for (const v of series) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('builds a single-value non-axis series for gauge (v6)', () => {
    const config = generateChartConfig({ type: 'gauge' });
    expect((config.chart as { type: string }).type).toBe('gauge');
    const series = config.series as number[];
    expect(series.every((s) => typeof s === 'number')).toBe(true);
    expect(series.length).toBe(1);
    expect(Array.isArray(config.labels)).toBe(true);
  });

  it('builds funnel/pyramid with axis series and stage categories (v6)', () => {
    for (const type of ['funnel', 'pyramid'] as const) {
      const config = generateChartConfig({ type });
      const series = config.series as Array<{ data: number[] }>;
      expect(series[0].data.every((n) => typeof n === 'number')).toBe(true);
      expect((config.xaxis as { categories: string[] }).categories.length).toBe(
        series[0].data.length,
      );
    }
  });

  it('builds violin points with a density profile (v6)', () => {
    const config = generateChartConfig({ type: 'violin' });
    const series = config.series as Array<{
      data: Array<{ x: string; y: { density: number[][]; points?: number[] } }>;
    }>;
    expect(Array.isArray(series[0].data[0].y.density)).toBe(true);
    expect(series[0].data[0].y.density[0].length).toBe(2);
  });

  it('builds a nested hierarchy for sunburst (v6.7)', () => {
    const config = generateChartConfig({ type: 'sunburst' });
    expect((config.chart as { type: string }).type).toBe('sunburst');
    const series = config.series as Array<{ data: Array<{ x: string; children?: unknown[] }> }>;
    expect(series[0].data[0]).toHaveProperty('x');
    expect(Array.isArray(series[0].data[0].children)).toBe(true);
    // hierarchy carries x in the data, so no xaxis.categories
    expect(config.xaxis).toBeUndefined();
  });

  it('builds the same nested hierarchy for icicle (v7.6)', () => {
    const config = generateChartConfig({ type: 'icicle' });
    expect((config.chart as { type: string }).type).toBe('icicle');
    const series = config.series as Array<{ data: Array<{ x: string; children?: unknown[] }> }>;
    expect(series[0].data[0]).toHaveProperty('x');
    expect(Array.isArray(series[0].data[0].children)).toBe(true);
    expect(config.xaxis).toBeUndefined();
    // Same tree as the sunburst: one hierarchy, two layouts.
    expect(config.series).toEqual(generateChartConfig({ type: 'sunburst' }).series);
  });

  it('builds raw-observation data for histogram with no default categories (v6.9)', () => {
    const config = generateChartConfig({ type: 'histogram' });
    expect((config.chart as { type: string }).type).toBe('histogram');
    const series = config.series as Array<{ data: unknown[] }>;
    expect(series[0].data.every((n) => typeof n === 'number')).toBe(true);
    // bins are computed by the chart, so no placeholder xaxis.categories
    expect(config.xaxis).toBeUndefined();
  });

  it('builds a flat non-axis series for unit and waffle (v6.6)', () => {
    for (const type of ['unit', 'waffle'] as const) {
      const config = generateChartConfig({ type });
      expect((config.chart as { type: string }).type).toBe(type);
      const series = config.series as unknown[];
      expect(series.every((s) => typeof s === 'number')).toBe(true);
      expect((config.labels as string[]).length).toBe(series.length);
    }
  });

  it('seeds a waterfall with deltas and flagged running totals (v7.1)', () => {
    const config = generateChartConfig({ type: 'waterfall' });
    const data = (config.series as Array<{ data: Array<Record<string, unknown>> }>)[0].data;
    // Steps carry a signed y; running totals carry a flag and no y.
    expect(data.some((d) => typeof d.y === 'number' && (d.y as number) < 0)).toBe(true);
    const totals = data.filter((d) => d.isSubtotal === true || d.isTotal === true);
    expect(totals.length).toBeGreaterThan(0);
    expect(totals.every((d) => d.y === undefined)).toBe(true);
  });

  it('seeds a dumbbell with one series per measure over shared categories (v7.1)', () => {
    const config = generateChartConfig({ type: 'dumbbell' });
    const series = config.series as Array<{ name: string; data: Array<{ x: string; y: number }> }>;
    expect(series.length).toBeGreaterThanOrEqual(2);
    // Same x categories in every series, and a plain numeric y (not a pair).
    const cats = series.map((s) => s.data.map((d) => d.x).join(','));
    expect(new Set(cats).size).toBe(1);
    expect(series.every((s) => s.data.every((d) => typeof d.y === 'number'))).toBe(true);
  });

  it('never sets chart.stacked on a streamgraph (v7.1)', () => {
    const config = generateChartConfig({ type: 'streamgraph', stacked: true });
    expect((config.chart as Record<string, unknown>).stacked).toBeUndefined();
  });

  it('seeds a raincloud with a raw sample per category (v7.1)', () => {
    const config = generateChartConfig({ type: 'raincloud' });
    const data = (config.series as Array<{ data: Array<{ x: string; points: number[] }> }>)[0].data;
    expect(data.every((d) => Array.isArray(d.points) && d.points.length > 0)).toBe(true);
  });

  it('applies horizontal to a dumbbell through plotOptions.bar (v7.1)', () => {
    const config = generateChartConfig({ type: 'dumbbell', horizontal: true });
    expect(config.plotOptions).toEqual({ bar: { horizontal: true } });
  });

  it('generates a config that validates cleanly for every supported type', () => {
    for (const type of SUPPORTED_CHART_TYPES) {
      const config = generateChartConfig({ type });
      const result = validateChartConfig(config);
      expect(result.errors, `${type} should generate an error-free config`).toEqual([]);
    }
  });
});
