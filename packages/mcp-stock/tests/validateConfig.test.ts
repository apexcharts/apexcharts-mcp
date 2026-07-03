import { describe, expect, it } from 'vitest';
import { validateStockConfig } from '../src/validateConfig.js';

const candle = (x: string, y: [number, number, number, number], v = 100) => ({ x, y, v });
const okConfig = {
  series: [{ name: 'Price', data: [candle('2026-01-01', [100, 110, 95, 105]), candle('2026-01-02', [105, 115, 100, 112])] }],
  theme: { mode: 'light' },
};

describe('validateStockConfig — happy path', () => {
  it('accepts a minimal valid config', () => {
    const result = validateStockConfig(okConfig);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts overlays stacked with a single oscillator', () => {
    const result = validateStockConfig({
      ...okConfig,
      plotOptions: {
        stockChart: {
          indicators: {
            'moving average': { enabled: true },
            'bollinger bands': { enabled: true },
            rsi: { enabled: true },
          },
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});

describe('validateStockConfig — top-level shape', () => {
  it('flags a non-object config', () => {
    expect(validateStockConfig(null).errors[0].rule).toBe('config-not-object');
  });

  it('flags missing series', () => {
    expect(validateStockConfig({}).errors[0].rule).toBe('missing-series');
  });

  it('flags non-array series', () => {
    expect(validateStockConfig({ series: 'oops' }).errors[0].rule).toBe('series-not-array');
  });

  it('flags empty series', () => {
    expect(validateStockConfig({ series: [] }).errors[0].rule).toBe('series-empty');
  });

  it('flags series[0] without data', () => {
    expect(validateStockConfig({ series: [{ name: 'x' }] }).errors[0].rule).toBe('series-missing-data');
  });

  it('flags non-array data', () => {
    expect(validateStockConfig({ series: [{ data: 'oops' }] }).errors[0].rule).toBe('series-data-not-array');
  });

  it('warns on empty data', () => {
    const result = validateStockConfig({ series: [{ data: [] }] });
    expect(result.ok).toBe(true);
    expect(result.warnings[0].rule).toBe('data-empty');
  });
});

describe('validateStockConfig — OHLC points', () => {
  it('flags flat o/h/l/c keys', () => {
    const result = validateStockConfig({ series: [{ data: [{ x: '2026-01-01', o: 1, h: 2, l: 0, c: 1.5 }] }] });
    expect(result.errors.map((e) => e.rule)).toContain('ohlc-flat-keys');
  });

  it('flags a missing y', () => {
    const result = validateStockConfig({ series: [{ data: [{ x: '2026-01-01' }] }] });
    expect(result.errors.map((e) => e.rule)).toContain('point-missing-y');
  });

  it('flags a y that is not a 4-tuple', () => {
    const result = validateStockConfig({ series: [{ data: [{ x: '2026-01-01', y: [1, 2, 3] }] }] });
    expect(result.errors.map((e) => e.rule)).toContain('y-not-4-tuple');
  });

  it('flags non-number values in y', () => {
    const result = validateStockConfig({ series: [{ data: [{ x: '2026-01-01', y: [1, 2, 3, 'x'] }] }] });
    expect(result.errors.map((e) => e.rule)).toContain('y-not-numbers');
  });

  it('warns on an inconsistent OHLC tuple (high below open/close)', () => {
    // [open, high, low, close] with high < close
    const result = validateStockConfig({ series: [{ data: [{ x: '2026-01-01', y: [100, 101, 95, 110] }] }] });
    expect(result.warnings.map((w) => w.rule)).toContain('ohlc-inconsistent');
  });

  it('flags a missing x', () => {
    const result = validateStockConfig({ series: [{ data: [{ y: [1, 2, 0.5, 1.5] }] }] });
    expect(result.errors.map((e) => e.rule)).toContain('point-missing-x');
  });

  it('flags an x of the wrong type', () => {
    const result = validateStockConfig({ series: [{ data: [{ x: true, y: [1, 2, 0.5, 1.5] }] }] });
    expect(result.errors.map((e) => e.rule)).toContain('x-invalid-type');
  });

  it('warns on non-numeric volume', () => {
    const result = validateStockConfig({ series: [{ data: [{ x: '2026-01-01', y: [1, 2, 0.5, 1.5], v: 'lots' }] }] });
    expect(result.warnings.map((w) => w.rule)).toContain('volume-not-number');
  });

  it('warns when candles are not sorted ascending by x', () => {
    const result = validateStockConfig({
      series: [{ data: [candle('2026-01-02', [1, 2, 0.5, 1.5]), candle('2026-01-01', [1, 2, 0.5, 1.5])] }],
    });
    expect(result.warnings.map((w) => w.rule)).toContain('data-not-sorted');
  });
});

describe('validateStockConfig — theme', () => {
  it('flags a non-object theme', () => {
    const result = validateStockConfig({ ...okConfig, theme: 'dark' });
    expect(result.errors.map((e) => e.rule)).toContain('theme-not-object');
  });

  it('flags an invalid theme.mode', () => {
    const result = validateStockConfig({ ...okConfig, theme: { mode: 'midnight' } });
    expect(result.errors.map((e) => e.rule)).toContain('theme-mode-invalid');
  });
});

describe('validateStockConfig — indicators', () => {
  it('warns on an unknown indicator key', () => {
    const result = validateStockConfig({
      ...okConfig,
      plotOptions: { stockChart: { indicators: ['ma', 'rsi'] } },
    });
    expect(result.warnings.map((w) => w.rule)).toContain('unknown-indicator');
  });

  it('warns when more than one oscillator is enabled (array form)', () => {
    const result = validateStockConfig({
      ...okConfig,
      plotOptions: { stockChart: { indicators: ['rsi', 'macd'] } },
    });
    expect(result.warnings.map((w) => w.rule)).toContain('multiple-oscillators');
  });

  it('does not count a disabled oscillator in the object-map form', () => {
    const result = validateStockConfig({
      ...okConfig,
      plotOptions: {
        stockChart: { indicators: { rsi: { enabled: true }, macd: { enabled: false } } },
      },
    });
    expect(result.warnings.map((w) => w.rule)).not.toContain('multiple-oscillators');
  });

  it('flags a wrong indicators shape', () => {
    const result = validateStockConfig({
      ...okConfig,
      plotOptions: { stockChart: { indicators: 42 } },
    });
    expect(result.errors.map((e) => e.rule)).toContain('indicators-wrong-shape');
  });
});
