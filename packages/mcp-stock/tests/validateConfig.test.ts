import { describe, expect, it } from 'vitest';
import { ANALYSIS_KEYS, OSCILLATOR_KEYS, OVERLAY_KEYS } from '../src/indicators.js';
import { readKnownFile } from '../src/skill.js';
import { validateStockConfig } from '../src/validateConfig.js';

/** The `"key"` cells of each table in the bundled skill's indicators.md, by section heading. */
async function documentedIndicatorKeys(): Promise<Record<string, string[]>> {
  const doc = await readKnownFile('indicators.md');
  const tables: Record<string, string[]> = {};
  for (const section of doc.split(/^## /m).slice(1)) {
    const keys = [...section.matchAll(/^\|\s*`"([^"]+)"`\s*\|/gm)].map((m) => m[1]);
    if (keys.length) tables[section.slice(0, section.indexOf('\n'))] = keys;
  }
  return tables;
}

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

  // apexstock 0.4.0 lifted the one-oscillator cap: each oscillator gets its own
  // pane. An older rule warned on this and told the caller to drop one.
  it('accepts several oscillators at once, in both indicator shapes', () => {
    for (const indicators of [['rsi', 'macd', 'volumes'], { rsi: { enabled: true }, macd: { period: 12 } }]) {
      const result = validateStockConfig({ ...okConfig, plotOptions: { stockChart: { indicators } } });
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([]);
    }
  });

  // The validator's key list once lacked vwap, donchian channels, keltner
  // channels, atr and drawdown, so it warned on indicators the bundled skill
  // documents and an agent could drop a valid one to silence the warning.
  it('accepts every indicator key the bundled skill documents', async () => {
    const keys = Object.values(await documentedIndicatorKeys()).flat();
    expect(keys.length).toBeGreaterThan(0);
    const result = validateStockConfig({ ...okConfig, plotOptions: { stockChart: { indicators: keys } } });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('sorts overlays, oscillators and analysis panes the way the bundled skill does', async () => {
    const tables = await documentedIndicatorKeys();
    const table = (prefix: string) =>
      (Object.entries(tables).find(([heading]) => heading.startsWith(prefix))?.[1] ?? []).slice().sort();
    expect(table('Overlays')).toEqual([...OVERLAY_KEYS].sort());
    expect(table('Oscillators')).toEqual([...OSCILLATOR_KEYS].sort());
    expect(table('Analysis')).toEqual([...ANALYSIS_KEYS].sort());
  });

  it('flags a wrong indicators shape', () => {
    const result = validateStockConfig({
      ...okConfig,
      plotOptions: { stockChart: { indicators: 42 } },
    });
    expect(result.errors.map((e) => e.rule)).toContain('indicators-wrong-shape');
  });
});
