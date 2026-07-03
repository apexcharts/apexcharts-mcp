import { describe, expect, it } from 'vitest';
import { generateStockConfig } from '../src/generateConfig.js';

describe('generateStockConfig', () => {
  it('builds a minimal config with placeholder candles when none are given', () => {
    const config = generateStockConfig({});
    expect(config.chart).toMatchObject({ height: 600 });
    expect(config.theme).toEqual({ mode: 'light' });

    const series = config.series as Array<{ name: string; data: unknown[] }>;
    expect(series).toHaveLength(1);
    expect(series[0].name).toBe('Price');
    expect(series[0].data.length).toBeGreaterThan(0);
  });

  it('placeholder candles use the { x, y:[o,h,l,c], v } shape, ascending by x', () => {
    const config = generateStockConfig({});
    const data = (config.series as Array<{ data: Array<{ x: string; y: number[]; v: number }> }>)[0].data;
    for (const pt of data) {
      expect(typeof pt.x).toBe('string');
      expect(Array.isArray(pt.y)).toBe(true);
      expect(pt.y).toHaveLength(4);
      expect(pt.y.every((n) => typeof n === 'number')).toBe(true);
      expect(typeof pt.v).toBe('number');
    }
    const xs = data.map((p) => p.x);
    expect([...xs].sort()).toEqual(xs);
  });

  it('placeholder candles have consistent OHLC (high >= max(o,c), low <= min(o,c))', () => {
    const data = (generateStockConfig({}).series as Array<{ data: Array<{ y: number[] }> }>)[0].data;
    for (const { y } of data) {
      const [o, h, l, c] = y;
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
      expect(l).toBeLessThanOrEqual(Math.min(o, c));
    }
  });

  it('passes through data and name when supplied', () => {
    const data = [{ x: '2026-02-01', y: [1, 2, 0.5, 1.5], v: 10 }];
    const config = generateStockConfig({ data, name: 'AAPL' });
    const series = config.series as Array<{ name: string; data: unknown }>;
    expect(series[0].name).toBe('AAPL');
    expect(series[0].data).toBe(data);
  });

  it('honors height and theme', () => {
    const config = generateStockConfig({ height: 800, theme: 'dark' });
    expect(config.chart).toMatchObject({ height: 800 });
    expect(config.theme).toEqual({ mode: 'dark' });
  });

  it('attaches title only when provided', () => {
    expect(generateStockConfig({}).title).toBeUndefined();
    expect(generateStockConfig({ title: 'AAPL 1D' }).title).toEqual({ text: 'AAPL 1D' });
  });

  it('nests indicators under plotOptions.stockChart only when provided', () => {
    expect(generateStockConfig({}).plotOptions).toBeUndefined();

    const list = generateStockConfig({ indicators: ['moving average', 'rsi'] });
    expect(list.plotOptions).toEqual({
      stockChart: { indicators: ['moving average', 'rsi'] },
    });

    const map = generateStockConfig({ indicators: { 'bollinger bands': { period: 20 } } });
    expect(map.plotOptions).toEqual({
      stockChart: { indicators: { 'bollinger bands': { period: 20 } } },
    });
  });
});
