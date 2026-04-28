import { describe, expect, it } from 'vitest';
import { generateChartConfig } from '../src/generateConfig.js';

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
});
