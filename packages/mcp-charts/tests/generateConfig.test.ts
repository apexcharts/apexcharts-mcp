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

  it('honors stacked option only for bar/area types', () => {
    const stackedBar = generateChartConfig({ type: 'bar', stacked: true });
    expect((stackedBar.chart as { stacked?: boolean }).stacked).toBe(true);

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

  it('generates a config that validates cleanly for every supported type', () => {
    for (const type of SUPPORTED_CHART_TYPES) {
      const config = generateChartConfig({ type });
      const result = validateChartConfig(config);
      expect(result.errors, `${type} should generate an error-free config`).toEqual([]);
    }
  });
});
